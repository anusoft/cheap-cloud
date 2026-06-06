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

  // Bundled (free, included-with-the-instance) local storage. Only some
  // providers ship this: Hetzner attaches local NVMe to every server, AWS
  // "d"/"i" instance-store families include disk. Most clouds bundle 0 — you
  // attach block storage separately, priced via the snapshot's providerRates.
  bundledStorageGiB: z.number().nonnegative().optional(), // omitted ⇒ 0 (none bundled)
  bundledStorageType: z.string().optional(), // e.g. "local-nvme", "instance-store"

  // Included allowance used for like-for-like comparison: the disk + monthly
  // egress you'd get bundled for this shape. For Hetzner it's the instance's
  // real bundle; for providers that bundle nothing, it's imputed from the
  // nearest-matching Hetzner server (see applyBundledReference) so the storage/
  // total views can credit a comparable baseline. `includedRef` records the
  // provenance ("self" or "hetzner:<NAME>").
  includedStorageGiB: z.number().nonnegative().optional(),
  includedBandwidthGiB: z.number().nonnegative().optional(),
  includedRef: z.string().optional(),

  commitments: z.array(Commitment).default([]),
  source: SourceMeta,
});
export type InstancePrice = z.infer<typeof InstancePrice>;

// ─────────────────────────────────────────────────────────────────────────────
// Provider-level storage & egress rates (the "sibling dataset" the docs left
// room for). Block storage $/GB-mo and internet egress $/GB are billed per
// provider/region, not per instance, so they live once per provider on the
// Snapshot rather than on every row. The web app combines these with a
// user-chosen workload (X GB storage + Y GB/mo egress) to build a
// storage-inclusive total. `rateSource` distinguishes a live API pull from a
// committed published-list figure (mirrors the Huawei published-rate pattern).
// ─────────────────────────────────────────────────────────────────────────────
export const ProviderRate = z.object({
  provider: ProviderId,
  // Attached block-storage general-purpose SSD, $ per GB-month.
  storagePerGbMonthUSD: z.number().nonnegative().nullable(),
  storageClass: z.string(), // human label, e.g. "gp3 SSD (EBS)", "PD balanced"
  // Every VM needs a system/boot disk. This is the provider's typical default
  // size and whether it's included free. Only Hetzner bundles persistent
  // storage free (its local NVMe, sized per shape — see InstancePrice); the
  // rest provision the boot disk as separately-billed block storage.
  bundledStorageGiB: z.number().nonnegative().default(0),
  bundledStorageFree: z.boolean().default(false),
  // Internet egress $ per GB beyond the free tier.
  egressPerGbUSD: z.number().nonnegative().nullable(),
  freeEgressGiB: z.number().nonnegative().default(0), // monthly included egress
  rateSource: z.enum(["live", "published"]),
  note: z.string().optional(),
  url: z.string().optional(),
});
export type ProviderRate = z.infer<typeof ProviderRate>;

// A region-scoped snapshot written to disk by the fetcher CLI.
export const Snapshot = z.object({
  schemaVersion: z.literal(1),
  regionKey: z.string(), // "bangkok"
  generatedAt: z.string(),
  providers: z.array(ProviderId), // which providers actually contributed
  rows: z.array(InstancePrice),
  // Per-provider storage/egress rates used to build storage-inclusive totals.
  // Optional + defaulted so older snapshots (without it) still parse.
  providerRates: z.array(ProviderRate).default([]),
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

// ─────────────────────────────────────────────────────────────────────────────
// Included storage/bandwidth reference
//
// Only Hetzner bundles storage (local NVMe) and a monthly egress allowance with
// the instance. To compare like-for-like, we use Hetzner's bundle as a baseline
// for the SAME setup: for every non-Hetzner row, find the nearest Hetzner server
// and borrow its bundled disk + included traffic as that row's `included*`
// allowance. Match order: exact vCPU+RAM → same RAM (nearest vCPU) → nearest by
// normalized (vCPU,RAM) distance. Hetzner rows reference themselves.
// ─────────────────────────────────────────────────────────────────────────────

export interface BundleRef {
  name: string;
  vcpu: number;
  ram: number; // GiB
  storageGiB: number; // bundled local NVMe (GiB)
}

// Built-in Hetzner Cloud bundle reference — real current line-up with exact
// bundled local-NVMe disk sizes (verified against the Hetzner /v1/server_types
// API). Used only as a fallback to size Hetzner's free disk when a snapshot
// lacks live API data; matched by instance name (exact), else nearest shape.
// (Included egress is per-location on the live row, not modeled here.)
export const HETZNER_BUNDLES: BundleRef[] = [
  // Shared AMD (CPX) — both current sub-generations
  { name: "CPX11", vcpu: 2, ram: 2, storageGiB: 40 },
  { name: "CPX12", vcpu: 1, ram: 2, storageGiB: 40 },
  { name: "CPX21", vcpu: 3, ram: 4, storageGiB: 80 },
  { name: "CPX22", vcpu: 2, ram: 4, storageGiB: 80 },
  { name: "CPX31", vcpu: 4, ram: 8, storageGiB: 160 },
  { name: "CPX32", vcpu: 4, ram: 8, storageGiB: 160 },
  { name: "CPX41", vcpu: 8, ram: 16, storageGiB: 240 },
  { name: "CPX42", vcpu: 8, ram: 16, storageGiB: 320 },
  { name: "CPX51", vcpu: 16, ram: 32, storageGiB: 360 },
  { name: "CPX52", vcpu: 12, ram: 24, storageGiB: 480 },
  { name: "CPX62", vcpu: 16, ram: 32, storageGiB: 640 },
  // Shared Intel (CX)
  { name: "CX23", vcpu: 2, ram: 4, storageGiB: 40 },
  { name: "CX33", vcpu: 4, ram: 8, storageGiB: 80 },
  { name: "CX43", vcpu: 8, ram: 16, storageGiB: 160 },
  { name: "CX53", vcpu: 16, ram: 32, storageGiB: 320 },
  // Shared ARM (CAX)
  { name: "CAX11", vcpu: 2, ram: 4, storageGiB: 40 },
  { name: "CAX21", vcpu: 4, ram: 8, storageGiB: 80 },
  { name: "CAX31", vcpu: 8, ram: 16, storageGiB: 160 },
  { name: "CAX41", vcpu: 16, ram: 32, storageGiB: 320 },
  // Dedicated (CCX)
  { name: "CCX13", vcpu: 2, ram: 8, storageGiB: 80 },
  { name: "CCX23", vcpu: 4, ram: 16, storageGiB: 160 },
  { name: "CCX33", vcpu: 8, ram: 32, storageGiB: 240 },
  { name: "CCX43", vcpu: 16, ram: 64, storageGiB: 360 },
  { name: "CCX53", vcpu: 32, ram: 128, storageGiB: 600 },
  { name: "CCX63", vcpu: 48, ram: 192, storageGiB: 960 },
];

function nearestBundle(
  pool: BundleRef[],
  vcpu: number,
  ram: number,
): BundleRef | null {
  if (pool.length === 0) return null;
  const smallestDisk = (xs: BundleRef[]) =>
    xs.reduce((a, b) => (b.storageGiB < a.storageGiB ? b : a));

  // 1) exact vCPU + RAM
  const exact = pool.filter((h) => h.vcpu === vcpu && h.ram === ram);
  if (exact.length) return smallestDisk(exact);

  // 2) same RAM, nearest vCPU
  const sameRam = pool.filter((h) => h.ram === ram);
  if (sameRam.length)
    return sameRam.reduce((a, b) =>
      Math.abs(b.vcpu - vcpu) < Math.abs(a.vcpu - vcpu) ? b : a,
    );

  // 3) nearest by normalized distance over (vCPU, RAM)
  const dist = (h: BundleRef) =>
    Math.abs(h.vcpu - vcpu) / Math.max(vcpu, 1) +
    Math.abs(h.ram - ram) / Math.max(ram, 1);
  return pool.reduce((a, b) => (dist(b) < dist(a) ? b : a));
}

/**
 * Resolve two storage figures per row:
 *  - `bundledStorageGiB` (Hetzner only): its free local-disk size, from live
 *    rows or the built-in HETZNER_BUNDLES table.
 *  - `includedStorageGiB` (every row): the disk a comparable Hetzner box bundles
 *    for the SAME shape (exact vCPU+RAM → same RAM → nearest) — the "match
 *    Hetzner" size. For Hetzner rows this is their own bundle.
 * Non-Hetzner own boot-disk size stays on ProviderRate.bundledStorageGiB.
 * Idempotent; mutates and returns.
 */
export function applyBundledReference(rows: InstancePrice[]): InstancePrice[] {
  // Hetzner rows: ensure their real bundled disk + self-reference.
  for (const r of rows) {
    if (r.provider !== "hetzner") continue;
    if ((r.bundledStorageGiB ?? 0) <= 0) {
      const b =
        HETZNER_BUNDLES.find((x) => x.name === r.instanceName.toUpperCase()) ??
        nearestBundle(HETZNER_BUNDLES, r.vcpu, r.ramGiB);
      if (b && r.bundledStorageGiB == null) r.bundledStorageGiB = b.storageGiB;
    }
    if (r.includedStorageGiB == null) r.includedStorageGiB = r.bundledStorageGiB ?? 0;
    if (r.includedRef == null) r.includedRef = "self";
  }

  // Reference pool: live Hetzner rows with real disk win; else the built-in table.
  const live: BundleRef[] = rows
    .filter((r) => r.provider === "hetzner" && (r.bundledStorageGiB ?? 0) > 0)
    .map((r) => ({
      name: r.instanceName,
      vcpu: r.vcpu,
      ram: r.ramGiB,
      storageGiB: r.bundledStorageGiB ?? 0,
    }));
  const pool = live.length ? live : HETZNER_BUNDLES;

  // Non-Hetzner rows: borrow the nearest Hetzner bundle size for the same shape.
  for (const r of rows) {
    if (r.provider === "hetzner") continue;
    if (r.includedStorageGiB != null) continue;
    const ref = nearestBundle(pool, r.vcpu, r.ramGiB);
    if (!ref) continue;
    r.includedStorageGiB = ref.storageGiB;
    if (r.includedRef == null) r.includedRef = `hetzner:${ref.name}`;
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
