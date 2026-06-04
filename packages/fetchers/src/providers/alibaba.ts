import {
  type InstancePrice,
  type Commitment,
  makeId,
  monthlyFrom,
} from "@cheap-cloud/schema";
import type { FetchContext, ProviderFetcher } from "../types.ts";
import type { Arch, Family } from "@cheap-cloud/schema";
import { alibabaRpc } from "../sign/alibaba.ts";

// Alibaba instance-family naming differs from AWS: g* = general (NOT gpu),
// c* = compute, r* = memory; GPU families are gn/vgn/sgn/pi/sccgn. Arch suffix:
// a = AMD (x86), y = Yitian Arm, r = Arm (older). Classify from its own rules.
function aliFamily(fam: string): Family {
  const f = fam.replace(/^ecs\./, "").toLowerCase();
  if (/^(gn|vgn|sgn|ebmgn|sccgn|pi|gpu)/.test(f)) return "gpu";
  if (/^(i\d|d\d|d1|i1)/.test(f)) return "storage";
  if (/^t\d/.test(f) || f.includes("burst")) return "burstable";
  if (/^(r|re|mem|hfr)/.test(f)) return "memory";
  if (/^(c|hfc|ic)/.test(f)) return "compute";
  if (/^(g|hfg|u1|s6)/.test(f)) return "general";
  return "general";
}
function aliArch(fam: string): Arch {
  const f = fam.replace(/^ecs\./, "").toLowerCase();
  // digit+y (Yitian) or digit+r (Arm) → arm64; "a" suffix is AMD x86.
  return /\dy\b|\dy$|\dr\b|\dr$|arm/.test(f) ? "arm64" : "x86_64";
}

const VERSION = "2014-05-26";

interface AliType {
  InstanceTypeId: string;
  InstanceTypeFamily: string;
  CpuCoreCount: number;
  MemorySize: number; // GiB
}
interface AliTypesResp {
  InstanceTypes?: { InstanceType: AliType[] };
}
interface AliPriceResp {
  PriceInfo?: {
    Price?: { TradePrice?: number; OriginalPrice?: number; Currency?: string };
  };
}

// Families worth pricing (general/compute/memory current-gen). Keeps the number
// of per-type DescribePrice calls bounded.
const FAMILY_PREFIXES = [
  "ecs.g7",
  "ecs.g8i",
  "ecs.g8a",
  "ecs.c7",
  "ecs.c8i",
  "ecs.c8a",
  "ecs.r7",
  "ecs.r8i",
  "ecs.g6",
  "ecs.c6",
  "ecs.r6",
];
const MAX_PRICE_CALLS = 80;

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (t: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = [];
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]!);
    }
  });
  await Promise.all(workers);
  return out;
}

export const alibabaFetcher: ProviderFetcher = {
  id: "alibaba",
  label: "Alibaba Cloud",
  available() {
    return process.env.ALIBABA_ACCESS_KEY_ID && process.env.ALIBABA_ACCESS_KEY_SECRET
      ? { ok: true }
      : { ok: false, reason: "ALIBABA_ACCESS_KEY_ID / _SECRET not set" };
  },
  async fetch(ctx: FetchContext): Promise<InstancePrice[]> {
    const region = ctx.providerRegion.code;
    const endpoint = `ecs.${region}.aliyuncs.com`;
    const id = process.env.ALIBABA_ACCESS_KEY_ID!;
    const secret = process.env.ALIBABA_ACCESS_KEY_SECRET!;

    const typesResp = await alibabaRpc<AliTypesResp>({
      endpoint,
      action: "DescribeInstanceTypes",
      version: VERSION,
      params: {},
      accessKeyId: id,
      accessKeySecret: secret,
    });

    const all = typesResp.InstanceTypes?.InstanceType ?? [];
    const wanted = all
      .filter((t) => FAMILY_PREFIXES.some((p) => t.InstanceTypeId.startsWith(p)))
      .slice(0, MAX_PRICE_CALLS);

    const describe = (it: string, extra: Record<string, string>) =>
      alibabaRpc<AliPriceResp>({
        endpoint,
        action: "DescribePrice",
        version: VERSION,
        params: { RegionId: region, ResourceType: "instance", InstanceType: it, ...extra },
        accessKeyId: id,
        accessKeySecret: secret,
      });

    const priced = await mapLimit(wanted, 5, async (t) => {
      try {
        const p = await describe(t.InstanceTypeId, { PriceUnit: "Hour" });
        const price = p.PriceInfo?.Price?.TradePrice;
        if (!price || price <= 0) return null;

        // Subscription (PrePaid) pricing: PriceUnit=Year, Period=N years.
        // TradePrice is the total for the whole period → amortize to hourly.
        const commitments: Commitment[] = [];
        for (const [term, period] of [["1yr", 1], ["3yr", 3]] as const) {
          try {
            const sub = await describe(t.InstanceTypeId, {
              PriceUnit: "Year",
              Period: String(period),
            });
            const total = sub.PriceInfo?.Price?.TradePrice;
            if (total && total > 0) {
              const eff = total / (8760 * period);
              if (eff < price) {
                commitments.push({
                  term,
                  model: "subscription",
                  upfront: "all",
                  effectiveHourlyUSD: eff,
                  discountPct: 1 - eff / price,
                });
              }
            }
          } catch {
            // subscription not available for this type — skip
          }
        }
        return { t, price, commitments };
      } catch {
        return null;
      }
    });

    const rows: InstancePrice[] = [];
    for (const r of priced) {
      if (!r) continue;
      const { t, price, commitments } = r;
      rows.push({
        id: makeId("alibaba", region, t.InstanceTypeId),
        provider: "alibaba",
        instanceName: t.InstanceTypeId,
        regionCode: region,
        regionLabel: ctx.region.label,
        family: aliFamily(t.InstanceTypeFamily),
        arch: aliArch(t.InstanceTypeFamily),
        vcpu: t.CpuCoreCount,
        ramGiB: t.MemorySize,
        onDemandHourlyUSD: price,
        monthlyUSD: monthlyFrom(price),
        perVcpuHourUSD: null,
        perGbHourUSD: null,
        commitments,
        source: {
          method: "api",
          url: `https://${endpoint} (DescribePrice)`,
          fetchedAt: ctx.fetchedAt,
          confidence: ctx.providerRegion.confidence,
        },
      });
    }
    return rows;
  },
};
