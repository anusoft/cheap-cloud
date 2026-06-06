import {
  type InstancePrice,
  type Commitment,
  makeId,
  monthlyFrom,
} from "@cheap-cloud/schema";
import type { FetchContext, ProviderFetcher } from "../types.ts";
import { AZURE_SIZES } from "./azure-sizes.ts";

// Azure Retail Prices API — public, unauthenticated. Thailand has no GA region,
// so we use Southeast Asia (Singapore) as a clearly-flagged proxy.
const API = "https://prices.azure.com/api/retail/prices";

interface AzureItem {
  armSkuName: string;
  retailPrice: number;
  unitOfMeasure: string;
  armRegionName: string;
  productName: string;
  skuName: string;
  meterName: string;
  type: string; // "Consumption" | "Reservation"
  reservationTerm?: string; // "1 Year" | "3 Years"
  savingsPlan?: { unitPrice: number; retailPrice: number; term: string }[];
}
interface AzurePage {
  Items: AzureItem[];
  NextPageLink: string | null;
}

function isSpot(item: AzureItem): boolean {
  return /spot|low priority/i.test(item.skuName + " " + item.meterName);
}

export const azureFetcher: ProviderFetcher = {
  id: "azure",
  label: "Azure",
  available: () => ({ ok: true }), // public API
  async fetch(ctx: FetchContext): Promise<InstancePrice[]> {
    const region = ctx.providerRegion.code;
    const filter = [
      `serviceName eq 'Virtual Machines'`,
      `armRegionName eq '${region}'`,
      `priceType eq 'Consumption'`,
    ].join(" and ");
    // 2023-01-01-preview is required for the savingsPlan (1yr/3yr) field.
    const first = `${API}?api-version=2023-01-01-preview&$filter=${encodeURIComponent(filter)}&currencyCode='USD'`;

    // Collect on-demand consumption prices keyed by armSkuName.
    const onDemand = new Map<string, AzureItem>();
    let next: string | null = first;
    let guard = 0;
    while (next && guard++ < 50) {
      const page = (await (await fetch(next)).json()) as AzurePage;
      for (const it of page.Items) {
        if (it.type !== "Consumption") continue;
        if (/windows/i.test(it.productName)) continue; // Linux baseline
        if (isSpot(it)) continue;
        if (!/hour/i.test(it.unitOfMeasure)) continue;
        if (!AZURE_SIZES[it.armSkuName]) continue;
        // Prefer the cheapest meter for a given SKU (handles dup meters).
        const cur = onDemand.get(it.armSkuName);
        if (!cur || it.retailPrice < cur.retailPrice) onDemand.set(it.armSkuName, it);
      }
      next = page.NextPageLink;
    }

    const rows: InstancePrice[] = [];
    for (const [sku, item] of onDemand) {
      const spec = AZURE_SIZES[sku]!;
      const od = item.retailPrice;
      if (!(od > 0)) continue;
      // Azure Savings Plan for compute (1yr/3yr) — hourly effective rates that
      // ride along on the consumption item under the preview api-version.
      const commitments: Commitment[] = (item.savingsPlan ?? [])
        .map((sp): Commitment | null => {
          const term = /3/.test(sp.term) ? "3yr" : /1/.test(sp.term) ? "1yr" : null;
          if (!term || !(sp.unitPrice > 0)) return null;
          return {
            term,
            model: "savings-plan",
            upfront: "none",
            effectiveHourlyUSD: sp.unitPrice,
            discountPct: 1 - sp.unitPrice / od,
          };
        })
        .filter((c): c is Commitment => c != null);
      rows.push({
        id: makeId("azure", region, sku),
        provider: "azure",
        instanceName: sku.replace(/^Standard_/, ""),
        regionCode: region,
        regionLabel: ctx.region.label,
        family: spec.family,
        arch: spec.arch,
        vcpu: spec.vcpu,
        ramGiB: spec.ramGiB,
        onDemandHourlyUSD: od,
        monthlyUSD: monthlyFrom(od),
        perVcpuHourUSD: null,
        perGbHourUSD: null,
        commitments,
        source: {
          method: "api",
          url: first,
          fetchedAt: ctx.fetchedAt,
          confidence: ctx.providerRegion.confidence,
        },
      });
    }
    return rows;
  },
  // NOTE: a live egress rate via the Retail Prices `Bandwidth` service was
  // attempted here, but Azure's modern routing-preference meters report $0 per
  // region (billing rolls up to Global volume tiers) and the legacy internet
  // egress meter isn't cleanly region-priced — extracting a trustworthy $/GB is
  // ambiguous, so Azure egress stays on the labeled published baseline. The
  // optional rates() hook remains available for a precise future implementation.
};
