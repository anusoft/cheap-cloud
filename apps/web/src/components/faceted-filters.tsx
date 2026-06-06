import { useEffect, useMemo, useState } from "react";
import type { InstancePrice, ProviderId } from "@cheap-cloud/schema";
import {
  type Filters,
  type GroupBy,
  type PriceMode,
  type Workload,
  PROVIDER_COLORS,
  PROVIDER_LABELS,
} from "../lib/view";

// Number filter with LOCAL string state, committed to the parent on a debounce.
// This keeps typing instant (no controlled-number fighting) and re-renders the
// big table at most once after you pause — fixes the typing freeze.
function NumInput({ value, onCommit }: { value: number; onCommit: (n: number) => void }) {
  const [local, setLocal] = useState(String(value));
  useEffect(() => setLocal(String(value)), [value]);
  useEffect(() => {
    const id = setTimeout(() => {
      const n = local.trim() === "" ? 0 : Number(local);
      if (Number.isFinite(n) && n !== value) onCommit(n);
    }, 250);
    return () => clearTimeout(id);
  }, [local]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <input
      type="number"
      min={0}
      inputMode="numeric"
      value={local}
      onChange={(e) => setLocal(e.target.value)}
    />
  );
}

// Like NumInput but an empty field commits null ("auto" = use the per-shape
// Hetzner bundle). Any number overrides every row.
function NullableNumInput({
  value,
  placeholder,
  onCommit,
}: {
  value: number | null;
  placeholder?: string;
  onCommit: (n: number | null) => void;
}) {
  const [local, setLocal] = useState(value == null ? "" : String(value));
  useEffect(() => setLocal(value == null ? "" : String(value)), [value]);
  useEffect(() => {
    const id = setTimeout(() => {
      const t = local.trim();
      if (t === "") {
        if (value !== null) onCommit(null);
        return;
      }
      const n = Number(t);
      if (Number.isFinite(n) && n !== value) onCommit(n);
    }, 250);
    return () => clearTimeout(id);
  }, [local]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <input
      type="number"
      min={0}
      inputMode="numeric"
      placeholder={placeholder}
      value={local}
      onChange={(e) => setLocal(e.target.value)}
    />
  );
}

interface Props {
  all: InstancePrice[];
  filters: Filters;
  setFilters: (f: Filters) => void;
  priceMode: PriceMode;
  setPriceMode: (m: PriceMode) => void;
  groupBy: GroupBy;
  setGroupBy: (g: GroupBy) => void;
  workload: Workload;
  setWorkload: (w: Workload) => void;
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
  workload,
  setWorkload,
  shown,
  total,
}: Props) {
  const providers = useMemo(() => [...new Set(all.map((r) => r.provider))] as ProviderId[], [all]);
  const families = useMemo(() => [...new Set(all.map((r) => r.family))].sort(), [all]);
  const archs = useMemo(() => [...new Set(all.map((r) => r.arch))].sort(), [all]);

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
              ["storage", "Storage"],
              ["total", "Total"],
            ] as [PriceMode, string][]
          ).map(([m, label]) => (
            <button key={m} className={priceMode === m ? "on" : ""} onClick={() => setPriceMode(m)}>
              {label}
            </button>
          ))}
        </div>
        <div className="hint">
          {priceMode === "storage"
            ? "Storage TCO — each provider's own bundled/boot disk (free on Hetzner)"
            : priceMode === "total"
              ? "Compute + storage for the disk below"
              : "On-demand · 1yr · 3yr shown as columns"}
        </div>
      </div>

      {(priceMode === "storage" || priceMode === "total") && (
        <div className="filter-block">
          <label className="lbl">Storage sizing</label>
          <label className="chk">
            <input
              type="checkbox"
              checked={workload.matchHetzner}
              onChange={() =>
                setWorkload({ ...workload, matchHetzner: !workload.matchHetzner })
              }
            />
            Match Hetzner bundle
          </label>
          {workload.matchHetzner ? (
            <div className="hint">
              Each shape is priced for the disk a comparable Hetzner box bundles
              (matched by vCPU/RAM) — free on Hetzner, billed elsewhere.
            </div>
          ) : (
            <>
              <div className="range-row">
                <NullableNumInput
                  value={workload.storageGiB}
                  placeholder="bundled"
                  onCommit={(n) => setWorkload({ ...workload, storageGiB: n })}
                />
                <span className="hint" style={{ alignSelf: "center" }}>
                  GB disk
                </span>
              </div>
              <div className="hint">
                Empty = each provider's own bundled/boot disk (free on Hetzner,
                billed elsewhere). Enter a value to provision that much on every
                row. (Bandwidth/egress is excluded from totals.)
              </div>
            </>
          )}
        </div>
      )}

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
          <NumInput value={filters.vcpuMin} onCommit={(n) => setFilters({ ...filters, vcpuMin: n })} />
          <NumInput value={filters.vcpuMax} onCommit={(n) => setFilters({ ...filters, vcpuMax: n })} />
        </div>
      </div>

      <div className="filter-block">
        <label className="lbl">RAM GiB: {filters.ramMin}–{filters.ramMax}</label>
        <div className="range-row">
          <NumInput value={filters.ramMin} onCommit={(n) => setFilters({ ...filters, ramMin: n })} />
          <NumInput value={filters.ramMax} onCommit={(n) => setFilters({ ...filters, ramMax: n })} />
        </div>
      </div>
    </div>
  );
}
