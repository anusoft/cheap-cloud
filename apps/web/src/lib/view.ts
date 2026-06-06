import type { InstancePrice, ProviderId, ProviderRate, Snapshot } from "@cheap-cloud/schema";

export const PROVIDER_LABELS: Record<ProviderId, string> = {
  aws: "AWS",
  gcp: "Google Cloud",
  azure: "Azure",
  alibaba: "Alibaba Cloud",
  tencent: "Tencent Cloud",
  huawei: "Huawei Cloud",
  hetzner: "Hetzner",
};

export const PROVIDER_COLORS: Record<ProviderId, string> = {
  aws: "#ff9900",
  gcp: "#4285f4",
  azure: "#0078d4",
  alibaba: "#ff6a00",
  tencent: "#0052d9",
  huawei: "#ff0000",
  hetzner: "#d50c2d",
};

// Default is monthly. "normalized" shows per-vCPU/per-GB unit economics.
// "storage" breaks out bundled storage + storage/egress rates; "total" adds a
// chosen storage+egress workload on top of compute.
export type PriceMode =
  | "monthly"
  | "yearly"
  | "hourly"
  | "normalized"
  | "storage"
  | "total";
export type Term = "1yr" | "3yr";
export type GroupBy = "none" | "provider" | "family" | "arch";

const HOURS = {
  monthly: 730,
  yearly: 8760,
  hourly: 1,
  normalized: 730,
  storage: 730,
  total: 730,
} as const;

export function unitFactor(mode: PriceMode): number {
  return HOURS[mode];
}
export function unitSuffix(mode: PriceMode): string {
  return mode === "monthly" ? "$/mo" : mode === "yearly" ? "$/yr" : "$/hr";
}

/**
 * A row's on-demand price in the selected unit. Monthly/yearly use the stored
 * monthlyUSD when present — for most providers that equals hourly×730, but
 * Hetzner's monthly is a real cap below hourly×730, so this keeps it accurate.
 */
export function priceInUnit(r: InstancePrice, mode: PriceMode): number | null {
  if (mode === "hourly") return r.onDemandHourlyUSD;
  if (r.monthlyUSD != null) {
    return mode === "yearly" ? r.monthlyUSD * 12 : r.monthlyUSD;
  }
  if (r.onDemandHourlyUSD == null) return null;
  return r.onDemandHourlyUSD * unitFactor(mode);
}

/** A row's committed (1yr/3yr) price in the selected unit, or null if no offer. */
export function commitInUnit(
  r: InstancePrice,
  term: Term,
  mode: PriceMode,
): number | null {
  const c = r.commitments.find((x) => x.term === term);
  if (!c) return null;
  return c.effectiveHourlyUSD * unitFactor(mode);
}

export function discountFor(r: InstancePrice, term: Term): number | null {
  const c = r.commitments.find((x) => x.term === term);
  return c ? c.discountPct : null;
}

// Per-vCPU-core and per-memory-GB cost in the selected unit ($/hr, $/mo, $/yr).
export function perVcpuInUnit(r: InstancePrice, mode: PriceMode): number | null {
  return r.perVcpuHourUSD == null ? null : r.perVcpuHourUSD * unitFactor(mode);
}
export function perGbInUnit(r: InstancePrice, mode: PriceMode): number | null {
  return r.perGbHourUSD == null ? null : r.perGbHourUSD * unitFactor(mode);
}

// Short unit word for column headers: "mo" | "yr" | "hr".
export function unitWord(mode: PriceMode): string {
  return unitSuffix(mode).replace("$/", "");
}

export interface Filters {
  providers: Set<ProviderId>;
  families: Set<string>;
  archs: Set<string>;
  vcpuMin: number;
  vcpuMax: number;
  ramMin: number;
  ramMax: number;
  search: string;
}

export function fmtUSD(n: number | null | undefined, digits = 4): string {
  if (n == null) return "—";
  return `$${n.toFixed(digits)}`;
}

/** Money formatting that scales with magnitude (hr → many decimals, yr → none). */
export function fmtMoney(n: number | null | undefined, mode: PriceMode): string {
  if (n == null) return "—";
  if (mode === "hourly") return `$${n.toFixed(4)}`;
  if (n >= 1000) return `$${Math.round(n).toLocaleString()}`;
  if (n >= 100) return `$${n.toFixed(0)}`;
  return `$${n.toFixed(2)}`;
}

export function applyFilters(rows: InstancePrice[], f: Filters): InstancePrice[] {
  const q = f.search.trim().toLowerCase();
  return rows.filter((r) => {
    if (f.providers.size && !f.providers.has(r.provider)) return false;
    if (f.families.size && !f.families.has(r.family)) return false;
    if (f.archs.size && !f.archs.has(r.arch)) return false;
    if (r.vcpu < f.vcpuMin || r.vcpu > f.vcpuMax) return false;
    if (r.ramGiB < f.ramMin || r.ramGiB > f.ramMax) return false;
    if (q && !r.instanceName.toLowerCase().includes(q)) return false;
    return true;
  });
}

/** Map a value within [min,max] to a green→amber→red background color. */
export function heatColor(v: number, min: number, max: number): string {
  if (!Number.isFinite(v) || max <= min) return "transparent";
  const t = Math.max(0, Math.min(1, (v - min) / (max - min)));
  const hue = (1 - t) * 130; // 130=green (cheap) → 0=red (expensive)
  return `hsl(${hue}, 70%, 92%)`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Storage & egress — workload-driven, storage-inclusive totals.
//
// Block-storage $/GB-mo and egress $/GB live once per provider on the snapshot
// (snapshot.providerRates). Older snapshots predate that field, so we fall back
// to this published baseline (kept in sync with packages/fetchers/storage-rates).
// Bundled storage (free local disk) is per-instance on the row.
// ─────────────────────────────────────────────────────────────────────────────
const GiB_PER_TiB = 1024;

export const DEFAULT_PROVIDER_RATES: Record<ProviderId, ProviderRate> = {
  aws: { provider: "aws", storagePerGbMonthUSD: 0.096, storageClass: "gp3 SSD (EBS)", bundledStorageGiB: 8, bundledStorageFree: false, egressPerGbUSD: 0.09, freeEgressGiB: 100, rateSource: "published" },
  gcp: { provider: "gcp", storagePerGbMonthUSD: 0.1, storageClass: "PD balanced", bundledStorageGiB: 10, bundledStorageFree: false, egressPerGbUSD: 0.12, freeEgressGiB: 200, rateSource: "published" },
  azure: { provider: "azure", storagePerGbMonthUSD: 0.075, storageClass: "Standard SSD", bundledStorageGiB: 30, bundledStorageFree: false, egressPerGbUSD: 0.087, freeEgressGiB: 100, rateSource: "published" },
  alibaba: { provider: "alibaba", storagePerGbMonthUSD: 0.1, storageClass: "ESSD PL1", bundledStorageGiB: 40, bundledStorageFree: false, egressPerGbUSD: 0.12, freeEgressGiB: 0, rateSource: "published" },
  tencent: { provider: "tencent", storagePerGbMonthUSD: 0.1, storageClass: "SSD CBS", bundledStorageGiB: 50, bundledStorageFree: false, egressPerGbUSD: 0.12, freeEgressGiB: 0, rateSource: "published" },
  huawei: { provider: "huawei", storagePerGbMonthUSD: 0.1, storageClass: "EVS SSD", bundledStorageGiB: 40, bundledStorageFree: false, egressPerGbUSD: 0.1, freeEgressGiB: 0, rateSource: "published" },
  hetzner: { provider: "hetzner", storagePerGbMonthUSD: 0.048, storageClass: "Volume SSD (local disk bundled)", bundledStorageGiB: 40, bundledStorageFree: true, egressPerGbUSD: 0.0012, freeEgressGiB: 20 * GiB_PER_TiB, rateSource: "published" },
};

export type RateLookup = (p: ProviderId) => ProviderRate;

/** Build a provider→rate lookup from a snapshot, falling back to the baseline. */
export function ratesFromSnapshot(snap: Snapshot | null): RateLookup {
  const live = new Map<ProviderId, ProviderRate>();
  for (const r of snap?.providerRates ?? []) live.set(r.provider, r);
  return (p) => live.get(p) ?? DEFAULT_PROVIDER_RATES[p];
}

// matchHetzner: price each shape for the disk a comparable Hetzner box bundles.
// Otherwise storageGiB (a number) overrides every row, or null falls back to
// each provider's own bundled/boot disk.
export interface Workload {
  storageGiB: number | null; // manual override (when not matching Hetzner)
  egressGiB: number | null; // outbound internet traffic per month
  matchHetzner: boolean; // size storage to the nearest Hetzner bundle
}
export const DEFAULT_WORKLOAD: Workload = {
  storageGiB: null,
  egressGiB: null,
  matchHetzner: false,
};

export function bundledStorageGiB(r: InstancePrice): number {
  return r.bundledStorageGiB ?? 0;
}

// Included allowance for like-for-like comparison: the instance's own bundle
// (Hetzner) or the nearest-Hetzner reference imputed in applyBundledReference.
export function includedStorageGiB(r: InstancePrice): number {
  return r.includedStorageGiB ?? r.bundledStorageGiB ?? 0;
}
export function includedBandwidthGiB(r: InstancePrice): number {
  return r.includedBandwidthGiB ?? 0;
}

function isSelfBundled(r: InstancePrice): boolean {
  return r.provider === "hetzner" || r.includedRef === "self";
}

// Each shape's bundled/system disk size. Hetzner sizes it per shape (its free
// local NVMe); other providers use their provider-default boot-disk size.
export function ownBundledStorageGiB(r: InstancePrice, rate: ProviderRate): number {
  if (isSelfBundled(r)) {
    return r.includedStorageGiB ?? r.bundledStorageGiB ?? rate.bundledStorageGiB ?? 0;
  }
  return rate.bundledStorageGiB ?? 0;
}

// The portion of a shape's storage that is free (not billed). Hetzner's whole
// local disk is free; charged providers credit nothing.
export function freeStorageGiB(r: InstancePrice, rate: ProviderRate): number {
  if (isSelfBundled(r) || rate.bundledStorageFree) return ownBundledStorageGiB(r, rate);
  return 0;
}

// The storage GB actually priced for a row: the nearest-Hetzner bundle size
// (match mode), else the user's override, else the shape's own bundled disk.
export function effectiveStorageGiB(r: InstancePrice, rate: ProviderRate, wl: Workload): number {
  if (wl.matchHetzner) return includedStorageGiB(r);
  return wl.storageGiB ?? ownBundledStorageGiB(r, rate);
}

/** True when this shape's priced storage is included free (no charge). */
export function isStorageFree(r: InstancePrice, rate: ProviderRate, wl: Workload): boolean {
  return effectiveStorageGiB(r, rate, wl) <= freeStorageGiB(r, rate);
}

/** Monthly cost of the priced storage beyond the provider's own free disk. */
export function storageMonthlyUSD(r: InstancePrice, rate: ProviderRate, wl: Workload): number {
  const billable = Math.max(0, effectiveStorageGiB(r, rate, wl) - freeStorageGiB(r, rate));
  return billable * (rate.storagePerGbMonthUSD ?? 0);
}

/** Storage add-on for a row in a given month. Bandwidth/egress is intentionally
 * excluded from totals — Hetzner's bundled ~20 TB allowance dwarfs other
 * providers' free tiers and distorted the comparison. */
export function addonMonthlyUSD(r: InstancePrice, rate: ProviderRate, wl: Workload): number {
  return storageMonthlyUSD(r, rate, wl);
}

/** Convert a monthly amount into the selected display unit. */
export function monthlyToUnit(monthly: number, mode: PriceMode): number {
  if (mode === "hourly") return monthly / 730;
  if (mode === "yearly") return monthly * 12;
  return monthly; // monthly / normalized / storage / total
}

/** On-demand compute + storage + egress, in the selected unit. */
export function totalInUnit(
  r: InstancePrice,
  rate: ProviderRate,
  wl: Workload,
  mode: PriceMode,
): number | null {
  const compute = priceInUnit(r, "monthly");
  if (compute == null) return null;
  return monthlyToUnit(compute + addonMonthlyUSD(r, rate, wl), mode);
}

/** Committed (1yr/3yr) compute + storage + egress, in the selected unit. */
export function commitTotalInUnit(
  r: InstancePrice,
  rate: ProviderRate,
  wl: Workload,
  term: Term,
  mode: PriceMode,
): number | null {
  const compute = commitInUnit(r, term, "monthly");
  if (compute == null) return null;
  return monthlyToUnit(compute + addonMonthlyUSD(r, rate, wl), mode);
}

/** Raw GB value with thousands separators, e.g. "20,480 GB". */
export function fmtGB(gib: number | null | undefined): string {
  if (gib == null || gib <= 0) return "—";
  return `${Math.round(gib).toLocaleString()} GB`;
}

/** Compact GiB/TiB label for bundled/included storage & egress. */
export function fmtCapacity(gib: number | null | undefined): string {
  if (gib == null || gib <= 0) return "—";
  if (gib >= GiB_PER_TiB) {
    const tb = gib / GiB_PER_TiB;
    return `${Number.isInteger(tb) ? tb : tb.toFixed(1)} TB`;
  }
  return `${gib} GiB`;
}
