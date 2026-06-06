import {
  type InstancePrice,
  type Family,
  makeId,
} from "@cheap-cloud/schema";
import type { FetchContext, ProviderFetcher } from "../types.ts";

// Hetzner Cloud API — GET /v1/server_types returns specs AND per-location prices
// in one call. Prices are in EUR; Hetzner's price_monthly is a CAP (not hourly
// ×730), so we keep it as the real monthly cost and convert EUR→USD.
const API = "https://api.hetzner.cloud/v1/server_types?per_page=50";

interface HetznerPrice {
  location: string;
  price_hourly: { net: string; gross: string };
  price_monthly: { net: string; gross: string };
  included_traffic?: number; // bytes/month of egress included at this location
}
interface HetznerType {
  name: string;
  cores: number;
  memory: number; // GB
  disk: number;
  cpu_type: "shared" | "dedicated";
  architecture: "x86" | "arm";
  deprecated?: boolean;
  deprecation?: unknown | null;
  included_traffic?: number; // bytes/month (older API shape; may live on price)
  prices: HetznerPrice[];
}

const BYTES_PER_GIB = 1024 ** 3;
interface HetznerResp {
  server_types: HetznerType[];
  meta?: { pagination?: { next_page: number | null } };
}

// EUR→USD: live ECB rate via frankfurter.app (free, no key); override with
// HETZNER_EUR_USD; fall back to a sane constant if the FX call fails.
async function eurToUsd(): Promise<number> {
  const override = Number(process.env.HETZNER_EUR_USD);
  if (override > 0) return override;
  try {
    const r = await fetch("https://api.frankfurter.app/latest?from=EUR&to=USD");
    const j = (await r.json()) as { rates?: { USD?: number } };
    if (j.rates?.USD && j.rates.USD > 0) return j.rates.USD;
  } catch {
    // fall through to default
  }
  return 1.08;
}

export const hetznerFetcher: ProviderFetcher = {
  id: "hetzner",
  label: "Hetzner",
  available() {
    return process.env.HETZNER_API_TOKEN
      ? { ok: true }
      : { ok: false, reason: "HETZNER_API_TOKEN not set" };
  },
  async fetch(ctx: FetchContext): Promise<InstancePrice[]> {
    const loc = ctx.providerRegion.code; // "sin"
    const token = process.env.HETZNER_API_TOKEN!;
    const fx = await eurToUsd();

    const headers = { Authorization: `Bearer ${token}` };
    const types: HetznerType[] = [];
    let url: string | null = API;
    let guard = 0;
    while (url && guard++ < 20) {
      const res = await fetch(url, { headers });
      if (!res.ok) throw new Error(`Hetzner ${res.status}: ${await res.text()}`);
      const page = (await res.json()) as HetznerResp;
      types.push(...page.server_types);
      const next = page.meta?.pagination?.next_page;
      url = next ? `${API}&page=${next}` : null;
    }

    const rows: InstancePrice[] = [];
    for (const t of types) {
      if (t.deprecated || t.deprecation) continue;
      const price = t.prices.find((p) => p.location === loc);
      if (!price) continue; // not offered in this location (e.g. CX/CAX not in sin)

      const hourly = parseFloat(price.price_hourly.net) * fx;
      const monthly = parseFloat(price.price_monthly.net) * fx; // Hetzner monthly cap
      if (!(hourly > 0)) continue;

      // Hetzner has no compute/memory families; split by dedicated vs shared vCPU.
      const family: Family = t.cpu_type === "dedicated" ? "compute" : "general";

      rows.push({
        id: makeId("hetzner", loc, t.name),
        provider: "hetzner",
        instanceName: t.name.toUpperCase(),
        regionCode: loc,
        regionLabel: ctx.region.label,
        family,
        arch: t.architecture === "arm" ? "arm64" : "x86_64",
        vcpu: t.cores,
        ramGiB: t.memory,
        onDemandHourlyUSD: hourly,
        monthlyUSD: monthly,
        perVcpuHourUSD: null,
        perGbHourUSD: null,
        // Hetzner attaches local NVMe to every server, included in the price,
        // plus a monthly egress allowance (included_traffic, in bytes).
        bundledStorageGiB: t.disk,
        bundledStorageType: "local-nvme",
        includedStorageGiB: t.disk,
        includedBandwidthGiB: Math.round(
          (price.included_traffic ?? t.included_traffic ?? 0) / BYTES_PER_GIB,
        ),
        includedRef: "self",
        commitments: [], // Hetzner is on-demand only (no reserved/committed pricing)
        source: {
          method: "api",
          url: `https://api.hetzner.cloud/v1/server_types (EUR→USD ${fx.toFixed(4)})`,
          fetchedAt: ctx.fetchedAt,
          confidence: ctx.providerRegion.confidence,
        },
      });
    }
    return rows;
  },
};
