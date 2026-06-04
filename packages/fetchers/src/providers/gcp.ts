import {
  type InstancePrice,
  type Commitment,
  makeId,
  monthlyFrom,
} from "@cheap-cloud/schema";
import type { FetchContext, ProviderFetcher } from "../types.ts";
import { GCP_SHAPES } from "./gcp-shapes.ts";

// Google Cloud Billing Catalog API. Compute Engine service id is fixed.
const COMPUTE_SERVICE = "6F81-5844-456A";
const API = (token: string, key: string) =>
  `https://cloudbilling.googleapis.com/v1/services/${COMPUTE_SERVICE}/skus` +
  `?key=${encodeURIComponent(key)}&pageSize=5000` +
  (token ? `&pageToken=${encodeURIComponent(token)}` : "");

interface GcpSku {
  description: string;
  category?: {
    resourceFamily?: string;
    resourceGroup?: string;
    usageType?: string; // OnDemand | Preemptible | Commit1Yr | Commit3Yr
  };
  serviceRegions?: string[];
  pricingInfo?: {
    pricingExpression?: {
      usageUnit?: string;
      tieredRates?: { unitPrice?: { units?: string; nanos?: number } }[];
    };
  }[];
}
interface GcpPage {
  skus: GcpSku[];
  nextPageToken?: string;
}

function unitPrice(sku: GcpSku): number | null {
  const rates = sku.pricingInfo?.[0]?.pricingExpression?.tieredRates;
  if (!rates?.length) return null;
  const r = rates[rates.length - 1]!.unitPrice;
  if (!r) return null;
  const units = parseFloat(r.units ?? "0");
  const nanos = (r.nanos ?? 0) / 1e9;
  const v = units + nanos;
  return v > 0 ? v : null;
}

// Match ONLY the canonical predefined-instance SKUs and ignore the many noisy
// variants in the catalog (Sole Tenancy, Premium, Reserved, Custom, Overcommit,
// Spot/Preemptible, Extended). Two canonical shapes:
//   on-demand:   "<TOKEN> Instance Core|Ram running in <region>"
//   commitment:  "Commitment v1: <TOKEN> Cpu|Ram in <region> for N Year(s)"
function classify(
  desc: string,
  usage: string,
): { token: string; resource: "core" | "ram" } | null {
  let m = desc.match(/^([A-Za-z0-9]+) Instance (Core|Ram) running/i);
  if (m && usage === "OnDemand") {
    return { token: m[1]!.toUpperCase(), resource: /ram/i.test(m[2]!) ? "ram" : "core" };
  }
  m = desc.match(/^Commitment v\d+: ([A-Za-z0-9]+) (Cpu|Ram) in/i);
  if (m && (usage === "Commit1Yr" || usage === "Commit3Yr")) {
    return { token: m[1]!.toUpperCase(), resource: /ram/i.test(m[2]!) ? "ram" : "core" };
  }
  return null;
}

interface Rates {
  onDemand: { core?: number; ram?: number };
  commit1yr: { core?: number; ram?: number };
  commit3yr: { core?: number; ram?: number };
}

export const gcpFetcher: ProviderFetcher = {
  id: "gcp",
  label: "Google Cloud",
  available() {
    const key = process.env.GCP_API_KEY;
    return key
      ? { ok: true }
      : { ok: false, reason: "GCP_API_KEY not set" };
  },
  async fetch(ctx: FetchContext): Promise<InstancePrice[]> {
    const key = process.env.GCP_API_KEY!;
    const region = ctx.providerRegion.code;

    // Per-family unit rates collected from in-region Compute SKUs.
    const byFamily = new Map<string, Rates>();
    const ensure = (t: string) =>
      byFamily.get(t) ??
      byFamily.set(t, { onDemand: {}, commit1yr: {}, commit3yr: {} }).get(t)!;

    let token = "";
    let guard = 0;
    let firstUrl = "";
    do {
      const url = API(token, key);
      if (!firstUrl) firstUrl = url.replace(/key=[^&]+/, "key=***");
      const res = await fetch(url);
      if (!res.ok) throw new Error(`GCP catalog ${res.status}: ${await res.text()}`);
      const page = (await res.json()) as GcpPage;
      for (const sku of page.skus ?? []) {
        if (sku.category?.resourceFamily !== "Compute") continue;
        if (!sku.serviceRegions?.includes(region)) continue;
        const usage = sku.category.usageType;
        if (!["OnDemand", "Commit1Yr", "Commit3Yr"].includes(usage ?? "")) continue;
        const c = classify(sku.description, usage!);
        if (!c) continue;
        const price = unitPrice(sku);
        if (price == null) continue;
        const rec = ensure(c.token);
        const bucket =
          usage === "Commit1Yr"
            ? rec.commit1yr
            : usage === "Commit3Yr"
              ? rec.commit3yr
              : rec.onDemand;
        bucket[c.resource] = price;
      }
      token = page.nextPageToken ?? "";
    } while (token && guard++ < 50);

    const rows: InstancePrice[] = [];
    for (const shape of GCP_SHAPES) {
      const rates = byFamily.get(shape.familyToken);
      const core = rates?.onDemand.core;
      const ram = rates?.onDemand.ram;
      if (core == null || ram == null) continue; // family not priced in region

      const onDemand = core * shape.vcpu + ram * shape.ramGiB;
      const commitments: Commitment[] = [];
      for (const [term, r] of [
        ["1yr", rates!.commit1yr],
        ["3yr", rates!.commit3yr],
      ] as const) {
        if (r.core != null && r.ram != null) {
          const eff = r.core * shape.vcpu + r.ram * shape.ramGiB;
          commitments.push({
            term,
            model: "cud-resource",
            upfront: "none",
            effectiveHourlyUSD: eff,
            discountPct: onDemand > 0 ? 1 - eff / onDemand : 0,
          });
        }
      }

      rows.push({
        id: makeId("gcp", region, shape.name),
        provider: "gcp",
        instanceName: shape.name,
        regionCode: region,
        regionLabel: ctx.region.label,
        family: shape.family,
        arch: shape.arch,
        vcpu: shape.vcpu,
        ramGiB: shape.ramGiB,
        onDemandHourlyUSD: onDemand,
        monthlyUSD: monthlyFrom(onDemand),
        // GCP exposes native per-core / per-GB rates — no regression needed.
        perVcpuHourUSD: core,
        perGbHourUSD: ram,
        commitments,
        source: {
          method: "api",
          url: firstUrl,
          fetchedAt: ctx.fetchedAt,
          confidence: ctx.providerRegion.confidence,
        },
      });
    }
    return rows;
  },
};
