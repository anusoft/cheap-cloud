import type { InstancePrice, ProviderId, ProviderRate } from "@cheap-cloud/schema";
import type { Region, ProviderRegion } from "./regions.ts";

export interface FetchContext {
  region: Region;
  providerRegion: ProviderRegion;
  fetchedAt: string; // ISO timestamp, set once per CLI run
}

export interface ProviderFetcher {
  id: ProviderId;
  /** Human label for logs. */
  label: string;
  /** True when required credentials/env are present (public providers: always). */
  available(): { ok: boolean; reason?: string };
  /** Pull and normalize this provider's rows for the given region. */
  fetch(ctx: FetchContext): Promise<InstancePrice[]>;
  /**
   * Optional: live block-storage / egress rates for the region. Return any
   * subset of ProviderRate fields to override the published baseline (the CLI
   * merges over `publishedRate(provider)`); return null/omit to use published.
   */
  rates?(ctx: FetchContext): Promise<Partial<Omit<ProviderRate, "provider">> | null>;
}

// Classify an instance family from a provider-specific token (best effort,
// shared across fetchers that key off the instance-name prefix).
export function familyFromHints(opts: {
  name?: string;
  group?: string;
  ramPerVcpu?: number;
}): import("@cheap-cloud/schema").Family {
  const s = `${opts.name ?? ""} ${opts.group ?? ""}`.toLowerCase();
  if (/gpu|accelerator|\bg\d|\bp\d|\bvt\d|\bgn\d|\bpi\d/.test(s)) return "gpu";
  if (/burst|\bt\d|micro|small|shared|e2-micro|e2-small|e2-medium/.test(s))
    return "burstable";
  if (/highmem|memory|\br\d|\bx\d|\bz\d|\bre\d|\bma\d|highmemory/.test(s))
    return "memory";
  if (/compute|highcpu|\bc\d|\bh\d|\bhc\d/.test(s)) return "compute";
  if (/storage|\bi\d|\bd\d|\bis\d/.test(s)) return "storage";
  // Fall back to the vCPU:RAM ratio when the name is uninformative.
  if (opts.ramPerVcpu != null) {
    if (opts.ramPerVcpu <= 2.5) return "compute";
    if (opts.ramPerVcpu >= 7) return "memory";
  }
  return "general";
}
