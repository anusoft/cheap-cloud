import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { InstancePrice, Snapshot } from "@cheap-cloud/schema";
import { loadRegions, loadSnapshot, type RegionMeta } from "./lib/data";
import {
  type Filters,
  type PriceMode,
  PROVIDER_LABELS,
  applyFilters,
  commitInUnit,
  fmtMoney,
  fmtUSD,
  priceInUnit,
  unitSuffix,
} from "./lib/view";
import { ComparisonTable } from "./components/comparison-table";
import { FacetedFilters } from "./components/faceted-filters";
import { ChatPanel } from "./components/chat-panel";
import { RegionSelect } from "./components/region-select";

const DEFAULT_REGION = "bangkok";
const emptyFilters = (): Filters => ({
  providers: new Set(),
  families: new Set(),
  archs: new Set(),
  vcpuMin: 0,
  vcpuMax: 9999,
  ramMin: 0,
  ramMax: 99999,
  search: "",
});

export function Comparison() {
  const [regions, setRegions] = useState<RegionMeta[]>([]);
  const [regionKey, setRegionKey] = useState(DEFAULT_REGION);
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);

  const [priceMode, setPriceMode] = useState<PriceMode>("monthly");
  const [pinned, setPinned] = useState<Set<string>>(new Set());
  const [filters, setFilters] = useState<Filters>(emptyFilters);

  // ── sidebar: collapsible + resizable (persisted) ──────────────────────────
  const [sidebarW, setSidebarW] = useState(() =>
    Math.min(440, Math.max(190, Number(localStorage.getItem("cc.sidebarW")) || 240)),
  );
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem("cc.sidebarCollapsed") === "1",
  );
  const dragging = useRef(false);
  useEffect(() => localStorage.setItem("cc.sidebarW", String(sidebarW)), [sidebarW]);
  useEffect(
    () => localStorage.setItem("cc.sidebarCollapsed", collapsed ? "1" : "0"),
    [collapsed],
  );
  const startDrag = useCallback(() => {
    dragging.current = true;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
    const move = (e: MouseEvent) => setSidebarW(Math.min(460, Math.max(190, e.clientX)));
    const up = () => {
      dragging.current = false;
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  }, []);

  // ── data loading ──────────────────────────────────────────────────────────
  useEffect(() => {
    loadRegions().then(setRegions);
  }, []);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    loadSnapshot(regionKey).then((s) => {
      if (!alive) return;
      setSnap(s);
      setPinned(new Set());
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [regionKey]);

  const all = (snap?.rows ?? []) as InstancePrice[];
  const filtered = useMemo(() => applyFilters(all, filters), [all, filters]);
  const pinnedRows = useMemo(() => all.filter((r) => pinned.has(r.id)), [all, pinned]);
  const regionMeta = regions.find((r) => r.key === regionKey);

  const togglePin = (id: string) =>
    setPinned((s) => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  // Cheapest in the CURRENTLY SELECTED unit, recomputed on every filter change.
  const cheapest = useMemo(() => {
    const metric = (r: InstancePrice) =>
      priceMode === "normalized" ? r.perVcpuHourUSD : priceInUnit(r, priceMode);
    let best: InstancePrice | null = null;
    let bestV = Infinity;
    for (const r of filtered) {
      const v = metric(r);
      if (v != null && Number.isFinite(v) && v < bestV) {
        bestV = v;
        best = r;
      }
    }
    return best ? { row: best, val: bestV } : null;
  }, [filtered, priceMode]);
  const cheapestLabel = priceMode === "normalized" ? "$/vCPU-hr" : unitSuffix(priceMode);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <strong>cheap-cloud</strong>
          <span className="sub">multi-cloud VM pricing</span>
        </div>
        <RegionSelect regions={regions} value={regionKey} onChange={setRegionKey} />
        <a className="nav-link" href="#/analysis">
          Market analysis · บทวิเคราะห์ →
        </a>
        <div className="stats">
          <Stat label="Providers" value={snap ? String(snap.providers.length) : "—"} />
          <Stat label="Instances" value={String(all.length)} />
          {cheapest && (
            <Stat
              label={`Cheapest ${cheapestLabel}`}
              value={`${priceMode === "normalized" ? fmtUSD(cheapest.val, 4) : fmtMoney(cheapest.val, priceMode)} · ${PROVIDER_LABELS[cheapest.row.provider]} ${cheapest.row.instanceName}`}
            />
          )}
          <Stat
            label="Updated"
            value={
              snap && !snap.generatedAt.startsWith("1970")
                ? new Date(snap.generatedAt).toLocaleDateString()
                : "—"
            }
          />
        </div>
      </header>

      <div className="layout">
        {collapsed ? (
          <button className="sidebar-show" onClick={() => setCollapsed(false)} title="Show filters">
            ☰
          </button>
        ) : (
          <aside className="filters" style={{ width: sidebarW }}>
            <div className="filters-head">
              <span className="lbl">Filters</span>
              <button className="collapse-btn" onClick={() => setCollapsed(true)} title="Collapse">
                «
              </button>
            </div>
            <FacetedFilters
              all={all}
              filters={filters}
              setFilters={setFilters}
              priceMode={priceMode}
              setPriceMode={setPriceMode}
              shown={filtered.length}
              total={all.length}
            />
            <div className="resizer" onMouseDown={startDrag} title="Drag to resize" />
          </aside>
        )}

        <main className="main">
          {pinnedRows.length > 0 && (
            <div className="compare-strip">
              <span className="strip-label">Pinned</span>
              {pinnedRows.map((r) => (
                <div key={r.id} className="pin-card">
                  <button className="pin-x" onClick={() => togglePin(r.id)}>
                    ×
                  </button>
                  <div className="pc-name">
                    {PROVIDER_LABELS[r.provider]} · <span className="mono">{r.instanceName}</span>
                  </div>
                  <div className="pc-spec">
                    {r.vcpu} vCPU / {r.ramGiB} GiB · {r.arch}
                  </div>
                  <div className="pc-price">
                    {fmtMoney(priceInUnit(r, priceMode === "normalized" ? "monthly" : priceMode), priceMode === "normalized" ? "monthly" : priceMode)}
                    {" · "}
                    {fmtUSD(r.perVcpuHourUSD, 4)}/vCPU-hr
                  </div>
                </div>
              ))}
            </div>
          )}

          {loading ? (
            <div className="empty">Loading {regionMeta?.label ?? regionKey}…</div>
          ) : all.length === 0 ? (
            <div className="empty">
              No pricing snapshot for <strong>{regionMeta?.label ?? regionKey}</strong> yet.
              <br />
              Run <code>bun fetch --provider=all --region={regionKey}</code> then{" "}
              <code>bun run --cwd apps/web prep</code> to populate it.
            </div>
          ) : (
            <ComparisonTable
              rows={filtered}
              priceMode={priceMode}
              pinned={pinned}
              onTogglePin={togglePin}
            />
          )}
        </main>

        <ChatPanel rows={filtered} />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
    </div>
  );
}
