import {
  type InstancePrice,
  type Family,
  makeId,
  monthlyFrom,
} from "@cheap-cloud/schema";
import type { FetchContext, ProviderFetcher } from "../types.ts";
import { familyFromHints } from "../types.ts";
import { huaweiGet } from "../sign/huawei.ts";

// Huawei publishes linear per-vCPU / per-GiB unit rates for its Bangkok C-series
// (see docs/research). The live list-price path is the BSS on-demand rating API,
// which is account/project specific; we expose the official published unit rates
// here (env-overridable) and compute shape prices from real ECS flavors.
const RATE_VCPU = Number(process.env.HUAWEI_RATE_VCPU ?? 0.0569);
const RATE_RAM = Number(process.env.HUAWEI_RATE_RAM ?? 0.014225);

interface HwFlavor {
  id: string; // e.g. c7.large.2
  name: string;
  vcpus: string; // "2"
  ram: string; // MB, "4096"
  os_extra_specs?: Record<string, string>;
}
interface HwFlavorsResp {
  flavors?: HwFlavor[];
}

// Fallback catalog (C9/general families) when live flavor listing is unavailable.
const FALLBACK: { id: string; vcpu: number; ramGiB: number; family: Family }[] = [
  { id: "c9.large.2", vcpu: 2, ramGiB: 4, family: "compute" },
  { id: "c9.xlarge.2", vcpu: 4, ramGiB: 8, family: "compute" },
  { id: "c9.large.4", vcpu: 2, ramGiB: 8, family: "general" },
  { id: "c9.xlarge.4", vcpu: 4, ramGiB: 16, family: "general" },
  { id: "c9.2xlarge.4", vcpu: 8, ramGiB: 32, family: "general" },
  { id: "c9.4xlarge.4", vcpu: 16, ramGiB: 64, family: "general" },
  { id: "m9.large.8", vcpu: 2, ramGiB: 16, family: "memory" },
  { id: "m9.xlarge.8", vcpu: 4, ramGiB: 32, family: "memory" },
  { id: "m9.2xlarge.8", vcpu: 8, ramGiB: 64, family: "memory" },
];

function priceOf(vcpu: number, ramGiB: number): number {
  return vcpu * RATE_VCPU + ramGiB * RATE_RAM;
}

export const huaweiFetcher: ProviderFetcher = {
  id: "huawei",
  label: "Huawei Cloud",
  available() {
    // Unit-rate pricing always works; AK/SK + project id enable live flavors.
    return { ok: true };
  },
  async fetch(ctx: FetchContext): Promise<InstancePrice[]> {
    const region = ctx.providerRegion.code;
    let specs: { id: string; vcpu: number; ramGiB: number; family: Family }[] = [];
    let sourceUrl = "huawei: published linear unit rates";

    const ak = process.env.HUAWEI_ACCESS_KEY;
    const sk = process.env.HUAWEI_SECRET_KEY;
    const project = process.env.HUAWEI_PROJECT_ID;
    if (ak && sk && project) {
      try {
        const url = `https://ecs.${region}.myhuaweicloud.com/v1/${project}/cloudservers/flavors`;
        const resp = await huaweiGet<HwFlavorsResp>({ url, accessKey: ak, secretKey: sk });
        specs = (resp.flavors ?? [])
          .map((f) => {
            const vcpu = parseInt(f.vcpus, 10);
            const ramGiB = Math.round(parseInt(f.ram, 10) / 1024);
            return {
              id: f.id,
              vcpu,
              ramGiB,
              family: familyFromHints({ name: f.id, ramPerVcpu: ramGiB / vcpu }),
            };
          })
          .filter((s) => s.vcpu > 0 && s.ramGiB > 0);
        sourceUrl = url;
      } catch {
        specs = FALLBACK;
      }
    } else {
      specs = FALLBACK;
    }

    const seen = new Set<string>();
    const rows: InstancePrice[] = [];
    for (const s of specs) {
      if (seen.has(s.id)) continue;
      seen.add(s.id);
      const od = priceOf(s.vcpu, s.ramGiB);
      rows.push({
        id: makeId("huawei", region, s.id),
        provider: "huawei",
        instanceName: s.id,
        regionCode: region,
        regionLabel: ctx.region.label,
        family: s.family,
        arch: /\bkc1|kunpeng|arm/i.test(s.id) ? "arm64" : "x86_64",
        vcpu: s.vcpu,
        ramGiB: s.ramGiB,
        onDemandHourlyUSD: od,
        monthlyUSD: monthlyFrom(od),
        perVcpuHourUSD: RATE_VCPU,
        perGbHourUSD: RATE_RAM,
        commitments: [
          {
            term: "1yr",
            model: "subscription-yearly",
            upfront: "all",
            effectiveHourlyUSD: od * (10 / 12), // ~16.7% off (2 months free)
            discountPct: 1 - 10 / 12,
          },
        ],
        source: {
          method: "api",
          url: sourceUrl,
          fetchedAt: ctx.fetchedAt,
          confidence: ctx.providerRegion.confidence,
        },
      });
    }
    return rows;
  },
};
