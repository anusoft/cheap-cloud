import {
  type InstancePrice,
  type Commitment,
  type Arch,
  type Family,
  makeId,
  monthlyFrom,
} from "@cheap-cloud/schema";
import type { FetchContext, ProviderFetcher } from "../types.ts";
import { tencentRequest } from "../sign/tencent.ts";

// Tencent families are named by an authoritative prefix (S/SA/SR = Standard/
// general, C = compute, M/MA = memory, IT/D = storage, GN/GI/GT/PNV = gpu).
// SMALL/MEDIUM/LARGE in instance names are SIZES, not families — so classify
// from InstanceFamily, never from the size token or vCPU:RAM ratio.
function tcFamily(fam: string): Family {
  const f = fam.toUpperCase();
  if (/^(GN|GI|GT|PNV|GD|GS|HCCPNV)/.test(f)) return "gpu";
  if (/^(IT|D\d|BHM|CDH)/.test(f)) return "storage";
  if (/^MA?\d|^M\b/.test(f)) return "memory";
  if (/^(C|HCCIC)/.test(f)) return "compute";
  if (/^(S|SA|SR|SW)/.test(f)) return "general";
  return "general";
}
function tcArch(fam: string): Arch {
  return /^SR|arm|kunpeng/i.test(fam) ? "arm64" : "x86_64";
}

// Tencent CVM DescribeZoneInstanceConfigInfos returns specs + unit price for
// every instance config in a zone, in one call.
interface TcConfig {
  Zone: string;
  InstanceType: string;
  InstanceFamily: string;
  Cpu: number;
  Memory: number; // GiB
  Status: string; // SELL | SOLD_OUT
  InstanceChargeType: string; // POSTPAID_BY_HOUR | PREPAID | SPOTPAID
  Price?: {
    UnitPrice?: number; // postpaid hourly
    UnitPriceDiscount?: number;
    DiscountPrice?: number;
    OriginalPrice?: number; // prepaid monthly
    DiscountPriceOneYear?: number; // prepaid total for 1 year
    DiscountPriceThreeYears?: number; // prepaid total for 3 years
  };
}
interface TcResp {
  InstanceTypeQuotaSet: TcConfig[];
}

export const tencentFetcher: ProviderFetcher = {
  id: "tencent",
  label: "Tencent Cloud",
  available() {
    return process.env.TENCENT_SECRET_ID && process.env.TENCENT_SECRET_KEY
      ? { ok: true }
      : { ok: false, reason: "TENCENT_SECRET_ID / TENCENT_SECRET_KEY not set" };
  },
  async fetch(ctx: FetchContext): Promise<InstancePrice[]> {
    const region = ctx.providerRegion.code;
    const creds = {
      secretId: process.env.TENCENT_SECRET_ID!,
      secretKey: process.env.TENCENT_SECRET_KEY!,
    };
    const call = (charge: string) =>
      tencentRequest<TcResp>({
        service: "cvm",
        host: "cvm.tencentcloudapi.com",
        action: "DescribeZoneInstanceConfigInfos",
        version: "2017-03-12",
        region,
        payload: { Filters: [{ Name: "instance-charge-type", Values: [charge] }] },
        ...creds,
      });

    // Postpaid (on-demand hourly) + prepaid (subscription 1yr/3yr totals).
    const [resp, prepaid] = await Promise.all([
      call("POSTPAID_BY_HOUR"),
      call("PREPAID").catch(() => ({ InstanceTypeQuotaSet: [] }) as TcResp),
    ]);
    const subByType = new Map<string, TcConfig["Price"]>();
    for (const c of prepaid.InstanceTypeQuotaSet) {
      if (!subByType.has(c.InstanceType)) subByType.set(c.InstanceType, c.Price);
    }

    const seen = new Set<string>();
    const rows: InstancePrice[] = [];
    for (const c of resp.InstanceTypeQuotaSet) {
      if (c.Status === "SOLD_OUT") continue;
      const hourly = c.Price?.UnitPrice;
      if (hourly == null || !(hourly > 0)) continue;
      if (seen.has(c.InstanceType)) continue;
      seen.add(c.InstanceType);

      // Subscription (prepaid) 1yr/3yr totals → amortize to effective hourly.
      const sub = subByType.get(c.InstanceType);
      const commitments: Commitment[] = [];
      for (const [term, total, years] of [
        ["1yr", sub?.DiscountPriceOneYear, 1],
        ["3yr", sub?.DiscountPriceThreeYears, 3],
      ] as const) {
        if (total && total > 0) {
          const eff = total / (8760 * years);
          if (eff < hourly) {
            commitments.push({
              term,
              model: "subscription",
              upfront: "all",
              effectiveHourlyUSD: eff,
              discountPct: 1 - eff / hourly,
            });
          }
        }
      }
      rows.push({
        id: makeId("tencent", region, c.InstanceType),
        provider: "tencent",
        instanceName: c.InstanceType,
        regionCode: region,
        regionLabel: ctx.region.label,
        family: tcFamily(c.InstanceFamily),
        arch: tcArch(c.InstanceFamily),
        vcpu: c.Cpu,
        ramGiB: c.Memory,
        onDemandHourlyUSD: hourly,
        // Tencent's realistic monthly cost is the 1-month subscription
        // (prepaid DiscountPrice), well below postpaid hourly×730. Fall back to
        // hourly×730 only if a type exposes no subscription price.
        monthlyUSD: sub?.DiscountPrice ?? monthlyFrom(hourly),
        perVcpuHourUSD: null,
        perGbHourUSD: null,
        commitments,
        source: {
          method: "api",
          url: "https://cvm.tencentcloudapi.com (DescribeZoneInstanceConfigInfos)",
          fetchedAt: ctx.fetchedAt,
          confidence: ctx.providerRegion.confidence,
        },
      });
    }
    return rows;
  },
};
