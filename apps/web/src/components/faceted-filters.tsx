import type { InstancePrice, ProviderId } from "@cheap-cloud/schema";
import {
  type Filters,
  type GroupBy,
  type PriceMode,
  PROVIDER_COLORS,
  PROVIDER_LABELS,
} from "../lib/view";

interface Props {
  all: InstancePrice[];
  filters: Filters;
  setFilters: (f: Filters) => void;
  priceMode: PriceMode;
  setPriceMode: (m: PriceMode) => void;
  groupBy: GroupBy;
  setGroupBy: (g: GroupBy) => void;
  shown: number;
  total: number;
}

function toggle<T>(set: Set<T>, v: T): Set<T> {
  const next = new Set(set);
  next.has(v) ? next.delete(v) : next.add(v);
  return next;
}

export function FacetedFilters({
  all,
  filters,
  setFilters,
  priceMode,
  setPriceMode,
  groupBy,
  setGroupBy,
  shown,
  total,
}: Props) {
  const providers = [...new Set(all.map((r) => r.provider))] as ProviderId[];
  const families = [...new Set(all.map((r) => r.family))].sort();
  const archs = [...new Set(all.map((r) => r.arch))].sort();

  return (
    <div className="filter-content">
      <div className="filter-block">
        <input
          className="search"
          placeholder="Search instance…"
          value={filters.search}
          onChange={(e) => setFilters({ ...filters, search: e.target.value })}
        />
        <div className="count">
          {shown} / {total} shown
        </div>
      </div>

      <div className="filter-block">
        <label className="lbl">Price view</label>
        <div className="seg">
          {(
            [
              ["monthly", "$/mo"],
              ["yearly", "$/yr"],
              ["hourly", "$/hr"],
              ["normalized", "$/unit"],
            ] as [PriceMode, string][]
          ).map(([m, label]) => (
            <button key={m} className={priceMode === m ? "on" : ""} onClick={() => setPriceMode(m)}>
              {label}
            </button>
          ))}
        </div>
        <div className="hint">On-demand · 1yr · 3yr shown as columns</div>
      </div>

      <div className="filter-block">
        <label className="lbl">Group by</label>
        <div className="seg">
          {(
            [
              ["none", "None"],
              ["provider", "Provider"],
              ["family", "Family"],
              ["arch", "Arch"],
            ] as [GroupBy, string][]
          ).map(([g, label]) => (
            <button key={g} className={groupBy === g ? "on" : ""} onClick={() => setGroupBy(g)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="filter-block">
        <label className="lbl">Providers</label>
        {providers.map((p) => (
          <label key={p} className="chk">
            <input
              type="checkbox"
              checked={filters.providers.has(p)}
              onChange={() => setFilters({ ...filters, providers: toggle(filters.providers, p) })}
            />
            <span className="dot" style={{ background: PROVIDER_COLORS[p] }} />
            {PROVIDER_LABELS[p]}
          </label>
        ))}
      </div>

      <div className="filter-block">
        <label className="lbl">Family</label>
        {families.map((f) => (
          <label key={f} className="chk">
            <input
              type="checkbox"
              checked={filters.families.has(f)}
              onChange={() => setFilters({ ...filters, families: toggle(filters.families, f) })}
            />
            {f}
          </label>
        ))}
      </div>

      <div className="filter-block">
        <label className="lbl">Architecture</label>
        {archs.map((a) => (
          <label key={a} className="chk">
            <input
              type="checkbox"
              checked={filters.archs.has(a)}
              onChange={() => setFilters({ ...filters, archs: toggle(filters.archs, a) })}
            />
            {a === "arm64" ? "Arm64" : "x86-64"}
          </label>
        ))}
      </div>

      <div className="filter-block">
        <label className="lbl">vCPU: {filters.vcpuMin}–{filters.vcpuMax}</label>
        <div className="range-row">
          <input
            type="number"
            min={0}
            value={filters.vcpuMin}
            onChange={(e) => setFilters({ ...filters, vcpuMin: Number(e.target.value) })}
          />
          <input
            type="number"
            min={0}
            value={filters.vcpuMax}
            onChange={(e) => setFilters({ ...filters, vcpuMax: Number(e.target.value) })}
          />
        </div>
      </div>

      <div className="filter-block">
        <label className="lbl">RAM GiB: {filters.ramMin}–{filters.ramMax}</label>
        <div className="range-row">
          <input
            type="number"
            min={0}
            value={filters.ramMin}
            onChange={(e) => setFilters({ ...filters, ramMin: Number(e.target.value) })}
          />
          <input
            type="number"
            min={0}
            value={filters.ramMax}
            onChange={(e) => setFilters({ ...filters, ramMax: Number(e.target.value) })}
          />
        </div>
      </div>
    </div>
  );
}
