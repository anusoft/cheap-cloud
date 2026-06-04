import type { RegionMeta } from "../lib/data";

interface Props {
  regions: RegionMeta[];
  value: string;
  onChange: (key: string) => void;
}

// Region picker grouped by country. Regions without a shipped pricing snapshot
// are still selectable but marked — selecting one shows a "not yet priced" note.
export function RegionSelect({ regions, value, onChange }: Props) {
  const byCountry = new Map<string, RegionMeta[]>();
  for (const r of regions) {
    if (!r.enabled) continue;
    (byCountry.get(r.country) ?? byCountry.set(r.country, []).get(r.country)!).push(r);
  }
  const current = regions.find((r) => r.key === value);

  return (
    <label className="region-select">
      <span className="region-flag">{current?.flag ?? "🌐"}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {[...byCountry.entries()].map(([country, list]) => (
          <optgroup key={country} label={country}>
            {list.map((r) => (
              <option key={r.key} value={r.key}>
                {r.label}
                {r.hasData ? "" : " — no data"}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </label>
  );
}
