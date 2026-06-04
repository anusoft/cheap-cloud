import { z } from "zod";

// ─────────────────────────────────────────────────────────────────────────────
// Providers
// ─────────────────────────────────────────────────────────────────────────────
export const PROVIDERS = [
  "aws",
  "gcp",
  "azure",
  "alibaba",
  "tencent",
  "huawei",
  "hetzner",
] as const;
export const ProviderId = z.enum(PROVIDERS);
export type ProviderId = z.infer<typeof ProviderId>;

export const PROVIDER_LABELS: Record<ProviderId, string> = {
  aws: "AWS",
  gcp: "Google Cloud",
  azure: "Azure",
  alibaba: "Alibaba Cloud",
  tencent: "Tencent Cloud",
  huawei: "Huawei Cloud",
  hetzner: "Hetzner",
};

// ─────────────────────────────────────────────────────────────────────────────
// Instance taxonomy
// ─────────────────────────────────────────────────────────────────────────────
export const Family = z.enum([
  "general", // general purpose (m-series, n2/e2, S5/SA9, g7, C9)
  "compute", // compute optimized (c-series, c2/c4, C5, c7)
  "memory", // memory optimized (r-series, m2/n2-highmem, MA5)
  "burstable", // t-series / shared-core e2-micro etc.
  "gpu", // accelerator-attached
  "storage", // storage optimized (i/d-series)
  "other",
]);
export type Family = z.infer<typeof Family>;

export const Arch = z.enum(["x86_64", "arm64"]);
export type Arch = z.infer<typeof Arch>;

export const Confidence = z.enum(["confirmed", "proxy"]);
export type Confidence = z.infer<typeof Confidence>;

// ─────────────────────────────────────────────────────────────────────────────
// Commitments (reserved / CUD / savings plan / subscription)
// ─────────────────────────────────────────────────────────────────────────────
export const Commitment = z.object({
  term: z.enum(["1yr", "3yr"]),
  model: z.string(), // "reserved-no-upfront", "cud-resource", "savings-compute", "subscription", ...
  upfront: z.enum(["none", "partial", "all"]).default("none"),
  effectiveHourlyUSD: z.number().nonnegative(),
  discountPct: z.number(), // vs on-demand, 0..1
});
export type Commitment = z.infer<typeof Commitment>;

export const Gpu = z.object({
  count: z.number().int().positive(),
  model: z.string(),
});
export type Gpu = z.infer<typeof Gpu>;

export const SourceMeta = z.object({
  method: z.literal("api"),
  url: z.string(),
  fetchedAt: z.string(), // ISO timestamp
  confidence: Confidence,
});
export type SourceMeta = z.infer<typeof SourceMeta>;

// ─────────────────────────────────────────────────────────────────────────────
// The core row — what every fetcher produces and the table renders.
// ─────────────────────────────────────────────────────────────────────────────
export const InstancePrice = z.object({
  id: z.string(), // stable key: `${provider}:${regionCode}:${instanceName}`
  provider: ProviderId,
  instanceName: z.string(),
  regionCode: z.string(),
  regionLabel: z.string(),
  family: Family,
  arch: Arch,
  vcpu: z.number().positive(),
  ramGiB: z.number().nonnegative(),
  gpu: Gpu.optional(),

  onDemandHourlyUSD: z.number().nonnegative().nullable(),
  spotHourlyUSD: z.number().nonnegative().nullable().optional(),
  monthlyUSD: z.number().nonnegative().nullable(),

  // normalized (derived): per-vCPU and per-GB unit costs
  perVcpuHourUSD: z.number().nonnegative().nullable(),
  perGbHourUSD: z.number().nonnegative().nullable(),

  commitments: z.array(Commitment).default([]),
  source: SourceMeta,
});
export type InstancePrice = z.infer<typeof InstancePrice>;

// A region-scoped snapshot written to disk by the fetcher CLI.
export const Snapshot = z.object({
  schemaVersion: z.literal(1),
  regionKey: z.string(), // "bangkok"
  generatedAt: z.string(),
  providers: z.array(ProviderId), // which providers actually contributed
  rows: z.array(InstancePrice),
});
export type Snapshot = z.infer<typeof Snapshot>;

export const HOURS_PER_MONTH = 730;

// ─────────────────────────────────────────────────────────────────────────────
// Normalization helpers
//
// Most providers sell fixed instance shapes, so a single instance gives one
// (price, vcpu, ram) point — not enough to split CPU vs RAM cost. We therefore
// fit `price = a*vcpu + b*ram` per (provider, family) using least squares across
// all that provider/family's shapes, then back-fill perVcpu/perGb on each row.
// GCP exposes native per-core / per-GB SKUs, so its fetcher sets these directly
// and we skip regression for rows that already have them.
// ─────────────────────────────────────────────────────────────────────────────

export interface UnitRates {
  perVcpuHourUSD: number;
  perGbHourUSD: number;
}

/**
 * Fit price = a*vcpu + b*ram via non-negative-ish least squares (2 unknowns,
 * closed form). Falls back to a simple per-vCPU split when the system is
 * degenerate (e.g. all shapes share one vCPU:RAM ratio, or <2 points).
 */
export function fitUnitRates(
  points: { price: number; vcpu: number; ram: number }[],
): UnitRates | null {
  const pts = points.filter(
    (p) => p.price > 0 && p.vcpu > 0 && p.ram >= 0 && Number.isFinite(p.price),
  );
  if (pts.length === 0) return null;

  // Naive all-to-vCPU rate — used as a sanity floor below.
  const naiveVcpu =
    pts.reduce((s, p) => s + p.price, 0) /
    pts.reduce((s, p) => s + p.vcpu, 0);

  // Need ≥2 points with distinct vCPU:RAM ratios for a real 2-var fit.
  const ratios = new Set(pts.map((p) => (p.ram / p.vcpu).toFixed(4)));
  if (pts.length >= 2 && ratios.size >= 2) {
    // Normal equations for [a,b]: solve [Sxx Sxy; Sxy Syy][a;b] = [Sxp; Syp]
    let Sxx = 0,
      Syy = 0,
      Sxy = 0,
      Sxp = 0,
      Syp = 0;
    for (const p of pts) {
      Sxx += p.vcpu * p.vcpu;
      Syy += p.ram * p.ram;
      Sxy += p.vcpu * p.ram;
      Sxp += p.vcpu * p.price;
      Syp += p.ram * p.price;
    }
    const det = Sxx * Syy - Sxy * Sxy;
    if (Math.abs(det) > 1e-9) {
      const a = (Syy * Sxp - Sxy * Syp) / det;
      const b = (Sxx * Syp - Sxy * Sxp) / det;
      // Accept only when both coefficients are non-negative AND vCPU explains a
      // plausible share of cost. Burstable/credit families can fit a≈0 (all cost
      // pushed onto RAM), which is meaningless — fall through to the heuristic.
      if (a >= 0.2 * naiveVcpu && b >= 0)
        return { perVcpuHourUSD: a, perGbHourUSD: b };
    }
  }

  // Degenerate fallback: assume RAM is "free-ish" relative to vCPU only when we
  // truly cannot separate them. Attribute 75% of cost to vCPU, 25% to RAM,
  // averaged across points — a transparent heuristic, flagged by callers.
  let totalVcpu = 0,
    totalRam = 0,
    totalPrice = 0;
  for (const p of pts) {
    totalVcpu += p.vcpu;
    totalRam += p.ram;
    totalPrice += p.price;
  }
  if (totalVcpu === 0) return null;
  const a = (0.75 * totalPrice) / totalVcpu;
  const b = totalRam > 0 ? (0.25 * totalPrice) / totalRam : 0;
  return { perVcpuHourUSD: a, perGbHourUSD: b };
}

/**
 * Back-fill perVcpuHourUSD / perGbHourUSD on rows that don't already have them,
 * by fitting unit rates per (provider, family) group. Rows that already carry
 * native unit rates (e.g. GCP) are left untouched. Mutates and returns rows.
 */
export function applyNormalization(rows: InstancePrice[]): InstancePrice[] {
  const groups = new Map<string, InstancePrice[]>();
  for (const r of rows) {
    const key = `${r.provider}:${r.family}`;
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(r);
  }

  for (const [, group] of groups) {
    const needFit = group.filter(
      (r) => r.perVcpuHourUSD == null || r.perGbHourUSD == null,
    );
    if (needFit.length === 0) continue;

    const rates = fitUnitRates(
      group
        .filter((r) => r.onDemandHourlyUSD != null)
        .map((r) => ({
          price: r.onDemandHourlyUSD!,
          vcpu: r.vcpu,
          ram: r.ramGiB,
        })),
    );
    if (!rates) continue;

    for (const r of needFit) {
      if (r.perVcpuHourUSD == null) r.perVcpuHourUSD = rates.perVcpuHourUSD;
      if (r.perGbHourUSD == null) r.perGbHourUSD = rates.perGbHourUSD;
    }
  }
  return rows;
}

export function monthlyFrom(hourly: number | null): number | null {
  return hourly == null ? null : hourly * HOURS_PER_MONTH;
}

export function makeId(
  provider: ProviderId,
  regionCode: string,
  instanceName: string,
): string {
  return `${provider}:${regionCode}:${instanceName}`;
}
