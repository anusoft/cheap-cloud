import type { Snapshot, ProviderId } from "@cheap-cloud/schema";

// Region metadata as written by `prep-data` into public/data/regions.json.
export interface RegionMeta {
  key: string;
  label: string;
  city: string;
  country: string;
  countryCode: string;
  flag: string;
  enabled: boolean;
  hasData: boolean;
  providers: ProviderId[];
  providerRegions: Partial<
    Record<ProviderId, { code: string; confidence: "confirmed" | "proxy" }>
  >;
}

// BASE_URL is "/" in dev and the repo subpath (e.g. "/cheap-cloud/") on Pages.
const base = import.meta.env.BASE_URL;

export async function loadRegions(): Promise<RegionMeta[]> {
  const res = await fetch(`${base}data/regions.json`);
  if (!res.ok) return [];
  return (await res.json()) as RegionMeta[];
}

export async function loadSnapshot(key: string): Promise<Snapshot | null> {
  const res = await fetch(`${base}data/${key}.json`);
  if (!res.ok) return null;
  return (await res.json()) as Snapshot;
}
