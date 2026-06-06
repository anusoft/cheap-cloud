import {
  type InstancePrice,
  type Arch,
  type Commitment,
  makeId,
  monthlyFrom,
} from "@cheap-cloud/schema";
import type { FetchContext, ProviderFetcher } from "../types.ts";
import { familyFromHints } from "../types.ts";

// AWS Price List Bulk JSON API — fully public, no credentials.
// region_index.json maps each region code to a per-region EC2 offer file.
const REGION_INDEX =
  "https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonEC2/current/region_index.json";
const BASE = "https://pricing.us-east-1.amazonaws.com";

interface AwsProduct {
  sku: string;
  productFamily?: string;
  attributes?: Record<string, string>;
}
interface AwsPriceDim {
  pricePerUnit?: { USD?: string };
  unit?: string;
}
interface AwsOnDemandTerm {
  priceDimensions?: Record<string, AwsPriceDim>;
}
interface AwsReservedTerm {
  termAttributes?: {
    LeaseContractLength?: string;
    PurchaseOption?: string;
    OfferingClass?: string;
  };
  priceDimensions?: Record<string, AwsPriceDim>;
}
interface AwsOffer {
  products: Record<string, AwsProduct>;
  terms: {
    OnDemand?: Record<string, Record<string, AwsOnDemandTerm>>;
    Reserved?: Record<string, Record<string, AwsReservedTerm>>;
  };
}

function archFrom(attr: Record<string, string>): Arch {
  const p = `${attr.physicalProcessor ?? ""} ${attr.processorArchitecture ?? ""}`.toLowerCase();
  if (p.includes("graviton") || p.includes("arm")) return "arm64";
  return "x86_64";
}

function parseGiB(memory?: string): number {
  // e.g. "8 GiB"
  const m = (memory ?? "").match(/([\d.]+)\s*GiB/i);
  return m ? parseFloat(m[1]!) : 0;
}

const TERM_HOURS: Record<string, number> = { "1yr": 8760, "3yr": 26280 };

function reservedCommitments(
  reserved: Record<string, AwsReservedTerm> | undefined,
  onDemandHourly: number,
): Commitment[] {
  if (!reserved) return [];
  const out: Commitment[] = [];
  for (const term of Object.values(reserved)) {
    const ta = term.termAttributes ?? {};
    if (ta.OfferingClass && ta.OfferingClass !== "standard") continue;
    const lease = ta.LeaseContractLength === "3yr" ? "3yr" : "1yr";
    let hourly = 0;
    let upfront = 0;
    for (const dim of Object.values(term.priceDimensions ?? {})) {
      const v = parseFloat(dim.pricePerUnit?.USD ?? "0");
      if ((dim.unit ?? "").toLowerCase() === "quantity") upfront += v;
      else hourly += v; // "Hrs"
    }
    const effective = hourly + upfront / TERM_HOURS[lease]!;
    if (effective <= 0) continue;
    const purchase = ta.PurchaseOption ?? "No Upfront";
    out.push({
      term: lease,
      model: `reserved-${purchase.toLowerCase().replace(/\s+/g, "-")}`,
      upfront:
        purchase === "All Upfront"
          ? "all"
          : purchase === "Partial Upfront"
            ? "partial"
            : "none",
      effectiveHourlyUSD: effective,
      discountPct:
        onDemandHourly > 0 ? 1 - effective / onDemandHourly : 0,
    });
  }
  // Keep the cheapest per (term) to avoid dozens of near-duplicate rows.
  const best = new Map<string, Commitment>();
  for (const c of out) {
    const cur = best.get(c.term);
    if (!cur || c.effectiveHourlyUSD < cur.effectiveHourlyUSD) best.set(c.term, c);
  }
  return [...best.values()];
}

async function resolveRegionFile(regionCode: string): Promise<string> {
  const idx = (await (await fetch(REGION_INDEX)).json()) as {
    regions: Record<string, { currentVersionUrl: string }>;
  };
  const entry = idx.regions[regionCode];
  if (!entry) throw new Error(`AWS: region ${regionCode} not in price index`);
  return BASE + entry.currentVersionUrl;
}

// The per-region offer file is ~100+ MB and contains BOTH compute and EBS
// pricing, so memoize it per region — fetch() and rates() share one download.
const offerCache = new Map<string, Promise<{ offer: AwsOffer; url: string }>>();
function loadOffer(regionCode: string): Promise<{ offer: AwsOffer; url: string }> {
  let hit = offerCache.get(regionCode);
  if (!hit) {
    hit = (async () => {
      const url = await resolveRegionFile(regionCode);
      const offer = (await (await fetch(url)).json()) as AwsOffer;
      return { offer, url };
    })();
    offerCache.set(regionCode, hit);
  }
  return hit;
}

/** First positive on-demand price across an offer term's price dimensions. */
function firstPrice(terms: Record<string, AwsOnDemandTerm> | undefined): number | null {
  for (const term of Object.values(terms ?? {})) {
    for (const dim of Object.values(term.priceDimensions ?? {})) {
      const v = parseFloat(dim.pricePerUnit?.USD ?? "");
      if (Number.isFinite(v) && v > 0) return v;
    }
  }
  return null;
}

export const awsFetcher: ProviderFetcher = {
  id: "aws",
  label: "AWS",
  available: () => ({ ok: true }), // public API
  async fetch(ctx: FetchContext): Promise<InstancePrice[]> {
    const { offer, url } = await loadOffer(ctx.providerRegion.code);

    // Index reserved terms by sku for quick join.
    const reservedBySku = offer.terms.Reserved ?? {};
    const onDemandBySku = offer.terms.OnDemand ?? {};

    const rows: InstancePrice[] = [];
    const seen = new Set<string>();

    for (const product of Object.values(offer.products)) {
      if (product.productFamily !== "Compute Instance") continue;
      const a = product.attributes ?? {};
      if (a.operatingSystem !== "Linux") continue;
      if (a.tenancy !== "Shared") continue;
      if (a.preInstalledSw && a.preInstalledSw !== "NA") continue;
      if (a.licenseModel && a.licenseModel === "Bring your own license") continue;
      if (a.capacitystatus && a.capacitystatus !== "Used") continue;
      const instanceName = a.instanceType;
      if (!instanceName || seen.has(instanceName)) continue;

      // On-demand hourly
      const od = onDemandBySku[product.sku];
      let onDemand: number | null = null;
      if (od) {
        for (const term of Object.values(od)) {
          for (const dim of Object.values(term.priceDimensions ?? {})) {
            const v = parseFloat(dim.pricePerUnit?.USD ?? "");
            if (Number.isFinite(v) && v > 0) onDemand = v;
          }
        }
      }
      if (onDemand == null) continue;
      seen.add(instanceName);

      const vcpu = parseInt(a.vcpu ?? "0", 10) || 0;
      const ramGiB = parseGiB(a.memory);
      if (!vcpu) continue;

      const commitments = reservedCommitments(
        reservedBySku[product.sku],
        onDemand,
      );

      rows.push({
        id: makeId("aws", ctx.providerRegion.code, instanceName),
        provider: "aws",
        instanceName,
        regionCode: ctx.providerRegion.code,
        regionLabel: ctx.region.label,
        family: familyFromHints({
          name: instanceName,
          ramPerVcpu: ramGiB / vcpu,
        }),
        arch: archFrom(a),
        vcpu,
        ramGiB,
        onDemandHourlyUSD: onDemand,
        monthlyUSD: monthlyFrom(onDemand),
        perVcpuHourUSD: null, // filled by regression in normalize step
        perGbHourUSD: null,
        commitments,
        source: {
          method: "api",
          url,
          fetchedAt: ctx.fetchedAt,
          confidence: ctx.providerRegion.confidence,
        },
      });
    }
    return rows;
  },
  // Live block-storage rate: EBS gp3 ($/GB-month) lives in the SAME offer file
  // as compute (productFamily "Storage", volumeApiName "gp3"), so this reuses
  // the memoized download — no second fetch. Egress (Data Transfer) is in a
  // separate AWSDataTransfer offer, so it stays on the published baseline.
  async rates(ctx: FetchContext) {
    try {
      const { offer, url } = await loadOffer(ctx.providerRegion.code);
      const gp3 = Object.values(offer.products).find(
        (p) => p.productFamily === "Storage" && p.attributes?.volumeApiName === "gp3",
      );
      if (!gp3) return null;
      const price = firstPrice(offer.terms.OnDemand?.[gp3.sku]);
      if (price == null) return null;
      return {
        storagePerGbMonthUSD: price,
        storageClass: "gp3 SSD (EBS)",
        rateSource: "live" as const,
        url,
      };
    } catch {
      return null; // fall back to published baseline
    }
  },
};
