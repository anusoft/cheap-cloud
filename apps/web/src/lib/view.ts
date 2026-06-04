import type { InstancePrice, ProviderId } from "@cheap-cloud/schema";

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
export type PriceMode = "monthly" | "yearly" | "hourly" | "normalized";
export type Term = "1yr" | "3yr";

const HOURS = { monthly: 730, yearly: 8760, hourly: 1, normalized: 730 } as const;

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
