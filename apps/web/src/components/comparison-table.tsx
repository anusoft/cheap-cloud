import { useEffect, useMemo, useRef, useState } from "react";
import {
  type ColumnDef,
  type ExpandedState,
  type SortingState,
  flexRender,
  getCoreRowModel,
  getExpandedRowModel,
  getGroupedRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { InstancePrice } from "@cheap-cloud/schema";
import {
  type GroupBy,
  type PriceMode,
  type RateLookup,
  type Term,
  type Workload,
  PROVIDER_COLORS,
  PROVIDER_LABELS,
  addonMonthlyUSD,
  commitInUnit,
  commitTotalInUnit,
  discountFor,
  effectiveStorageGiB,
  isStorageFree,
  fmtGB,
  fmtMoney,
  fmtUSD,
  heatColor,
  perGbInUnit,
  perVcpuInUnit,
  priceInUnit,
  storageMonthlyUSD,
  totalInUnit,
  unitSuffix,
  unitWord,
} from "../lib/view";

const ROW_H = 34; // fixed row height (px) — must match the CSS row height

interface Props {
  rows: InstancePrice[];
  priceMode: PriceMode;
  groupBy: GroupBy;
  pinned: Set<string>;
  onTogglePin: (id: string) => void;
  rateFor: RateLookup;
  workload: Workload;
}

export function ComparisonTable({
  rows,
  priceMode,
  groupBy,
  pinned,
  onTogglePin,
  rateFor,
  workload,
}: Props) {
  const [sorting, setSorting] = useState<SortingState>([
    { id: "ondemand", desc: false },
  ]);
  const [expanded, setExpanded] = useState<ExpandedState>(true);
  useEffect(() => setExpanded(true), [groupBy]); // expand all when grouping changes

  // The headline (sorted + heat-mapped) metric for the current view.
  const headline = (r: InstancePrice): number | null => {
    if (priceMode === "normalized") return r.perVcpuHourUSD;
    if (priceMode === "storage" || priceMode === "total")
      return totalInUnit(r, rateFor(r.provider), workload, priceMode);
    return priceInUnit(r, priceMode);
  };

  // Heat-map bounds for the headline price across the visible rows.
  const bounds = useMemo(() => {
    let min = Infinity;
    let max = -Infinity;
    for (const r of rows) {
      const v = headline(r);
      if (v != null && Number.isFinite(v)) {
        if (v < min) min = v;
        if (v > max) max = v;
      }
    }
    return { min, max };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, priceMode, rateFor, workload]);

  const columns = useMemo<ColumnDef<InstancePrice>[]>(() => {
    const cols: ColumnDef<InstancePrice>[] = [
      {
        id: "pin",
        header: "",
        size: 32,
        enableSorting: false,
        cell: ({ row }) => (
          <button
            className={`pin ${pinned.has(row.original.id) ? "on" : ""}`}
            title="Pin to compare"
            onClick={() => onTogglePin(row.original.id)}
          >
            ★
          </button>
        ),
      },
      {
        id: "provider",
        header: "Provider",
        accessorFn: (r) => r.provider,
        size: 124,
        cell: ({ row }) => {
          const p = row.original.provider;
          return (
            <span className="badge" style={{ background: PROVIDER_COLORS[p] }}>
              {PROVIDER_LABELS[p]}
            </span>
          );
        },
      },
      {
        id: "instance",
        header: "Instance",
        accessorFn: (r) => r.instanceName,
        size: 168,
        cell: ({ row }) => <span className="mono">{row.original.instanceName}</span>,
      },
      { id: "family", header: "Family", accessorFn: (r) => r.family, size: 92 },
      {
        id: "arch",
        header: "Arch",
        accessorFn: (r) => r.arch,
        size: 76,
        cell: ({ row }) => (
          <span className={`arch ${row.original.arch}`}>
            {row.original.arch === "arm64" ? "Arm64" : "x86-64"}
          </span>
        ),
      },
      { id: "vcpu", header: "vCPU", accessorFn: (r) => r.vcpu, size: 64 },
      {
        id: "ram",
        header: "RAM",
        accessorFn: (r) => r.ramGiB,
        size: 78,
        cell: ({ row }) => `${row.original.ramGiB} GiB`,
      },
    ];

    if (priceMode === "normalized") {
      cols.push(
        {
          id: "ondemand",
          header: "$/vCPU-hr",
          accessorFn: (r) => r.perVcpuHourUSD ?? Infinity,
          aggregationFn: "min",
          size: 120,
          cell: ({ row }) => {
            const v = row.original.perVcpuHourUSD;
            return (
              <span
                className="cell-heat"
                style={{ background: v == null ? "transparent" : heatColor(v, bounds.min, bounds.max) }}
              >
                {fmtUSD(v, 4)}
              </span>
            );
          },
        },
        {
          id: "perGb",
          header: "$/GB-hr",
          accessorFn: (r) => r.perGbHourUSD ?? Infinity,
          size: 110,
          cell: ({ row }) => fmtUSD(row.original.perGbHourUSD, 5),
        },
      );
    } else if (priceMode === "storage") {
      // Storage + bandwidth TCO: raw GB priced per row (pre-filled from the
      // nearest-Hetzner bundle, overridable) and the $/mo each provider charges
      // for it after crediting its own free allowance, plus the all-in total.
      cols.push(
        {
          id: "storageGiB",
          header: "Storage (GB)",
          accessorFn: (r) => effectiveStorageGiB(r, rateFor(r.provider), workload),
          size: 142,
          cell: ({ row }) => {
            const r = row.original;
            const rate = rateFor(r.provider);
            const gib = effectiveStorageGiB(r, rate, workload);
            const free = isStorageFree(r, rate, workload);
            return (
              <span title={`${fmtUSD(rate.storagePerGbMonthUSD, 4)}/GB-mo · ${rate.storageClass} · ${gbSource(r, workload)}`}>
                {fmtGB(gib)}{" "}
                <span className={free ? "conf ok" : "muted"}>{free ? "free" : "charged"}</span>
              </span>
            );
          },
        },
        {
          id: "storageCost",
          header: "Storage $/mo",
          accessorFn: (r) => storageMonthlyUSD(r, rateFor(r.provider), workload),
          size: 124,
          cell: ({ row }) => (
            <span className="unit-cell">
              {fmtMoney(storageMonthlyUSD(row.original, rateFor(row.original.provider), workload), "monthly")}
            </span>
          ),
        },
        totalColumn(rateFor, workload, bounds),
      );
    } else if (priceMode === "total") {
      // Compute + storage + egress, all-in, with committed equivalents.
      cols.push(
        {
          id: "compute",
          header: "Compute $/mo",
          accessorFn: (r) => priceInUnit(r, "monthly") ?? Infinity,
          size: 124,
          cell: ({ row }) => (
            <span className="unit-cell">{fmtMoney(priceInUnit(row.original, "monthly"), "monthly")}</span>
          ),
        },
        {
          id: "addon",
          header: "+ Storage",
          accessorFn: (r) => addonMonthlyUSD(r, rateFor(r.provider), workload),
          size: 120,
          cell: ({ row }) => (
            <span className="unit-cell">
              {fmtMoney(addonMonthlyUSD(row.original, rateFor(row.original.provider), workload), "monthly")}
            </span>
          ),
        },
        totalColumn(rateFor, workload, bounds),
        commitTotalColumn("1yr", rateFor, workload),
        commitTotalColumn("3yr", rateFor, workload),
      );
    } else {
      const suffix = unitSuffix(priceMode);
      cols.push(
        {
          id: "ondemand",
          header: `On-demand ${suffix}`,
          accessorFn: (r) => priceInUnit(r, priceMode) ?? Infinity,
          aggregationFn: "min",
          size: 150,
          cell: ({ row }) => {
            const v = priceInUnit(row.original, priceMode);
            return (
              <span
                className="cell-heat"
                style={{ background: v == null ? "transparent" : heatColor(v, bounds.min, bounds.max) }}
              >
                {fmtMoney(v, priceMode)}
              </span>
            );
          },
        },
        commitColumn("1yr", priceMode),
        commitColumn("3yr", priceMode),
        {
          id: "perVcpu",
          header: `$/vCPU·${unitWord(priceMode)}`,
          accessorFn: (r) => perVcpuInUnit(r, priceMode) ?? Infinity,
          size: 108,
          cell: ({ row }) => (
            <span className="unit-cell">{fmtMoney(perVcpuInUnit(row.original, priceMode), priceMode)}</span>
          ),
        },
        {
          id: "perGb",
          header: `$/GB·${unitWord(priceMode)}`,
          accessorFn: (r) => perGbInUnit(r, priceMode) ?? Infinity,
          size: 98,
          cell: ({ row }) => (
            <span className="unit-cell">{fmtMoney(perGbInUnit(row.original, priceMode), priceMode)}</span>
          ),
        },
      );
    }

    cols.push({
      id: "conf",
      header: "Src",
      accessorFn: (r) => r.source.confidence,
      size: 60,
      cell: ({ row }) =>
        row.original.source.confidence === "proxy" ? (
          <span className="conf proxy" title="Proxy region / derived price">
            proxy
          </span>
        ) : (
          <span className="conf ok" title="Confirmed Thailand region">
            ✓
          </span>
        ),
    });
    return cols;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [priceMode, bounds, pinned, onTogglePin, rateFor, workload]);

  const table = useReactTable({
    data: rows,
    columns,
    state: {
      sorting,
      expanded,
      grouping: groupBy === "none" ? [] : [groupBy],
    },
    onSortingChange: setSorting,
    onExpandedChange: setExpanded,
    autoResetExpanded: false,
    autoResetAll: false,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getGroupedRowModel: getGroupedRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
  });

  const tableRows = table.getRowModel().rows;
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: tableRows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_H,
    overscan: 16,
  });

  return (
    <div className="table-scroll" ref={parentRef}>
      <table className="grid" style={{ width: table.getTotalSize() }}>
        <thead>
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id}>
              {hg.headers.map((h) => (
                <th
                  key={h.id}
                  style={{ width: h.getSize() }}
                  className={h.column.getCanSort() ? "sortable" : ""}
                  onClick={h.column.getToggleSortingHandler()}
                >
                  {flexRender(h.column.columnDef.header, h.getContext())}
                  {{ asc: " ▲", desc: " ▼" }[h.column.getIsSorted() as string] ?? ""}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
          {virtualizer.getVirtualItems().map((vi) => {
            const row = tableRows[vi.index]!;
            const posStyle = { transform: `translateY(${vi.start}px)` };
            // Fixed-height virtualization (every row is ROW_H px) — no
            // measureElement, so there is no per-row ResizeObserver to thrash.
            if (row.getIsGrouped()) {
              return (
                <tr
                  key={row.id}
                  className="group-row"
                  style={{ height: ROW_H, ...posStyle }}
                >
                  <td className="group-cell">
                    <button className="group-toggle" onClick={row.getToggleExpandedHandler()}>
                      {row.getIsExpanded() ? "▾" : "▸"}
                    </button>
                    <GroupLabel groupBy={groupBy} value={String(row.getGroupingValue(groupBy))} />
                    <span className="group-count">{row.subRows.length}</span>
                    <GroupMeta
                    leaves={row.subRows.map((s) => s.original)}
                    priceMode={priceMode}
                    rateFor={rateFor}
                    workload={workload}
                  />
                  </td>
                </tr>
              );
            }
            return (
              <tr
                key={row.id}
                className={pinned.has(row.original.id) ? "pinned" : ""}
                style={{ height: ROW_H, ...posStyle }}
              >
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} style={{ width: cell.column.getSize() }}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function GroupLabel({ groupBy, value }: { groupBy: GroupBy; value: string }) {
  if (groupBy === "provider") {
    const p = value as keyof typeof PROVIDER_LABELS;
    return (
      <span className="badge" style={{ background: PROVIDER_COLORS[p] }}>
        {PROVIDER_LABELS[p] ?? value}
      </span>
    );
  }
  if (groupBy === "arch") {
    return <span className="group-name">{value === "arm64" ? "Arm64" : "x86-64"}</span>;
  }
  return <span className="group-name">{value}</span>;
}

// Per-group insight: instance count, cheapest headline price, and best $/vCPU.
function GroupMeta({
  leaves,
  priceMode,
  rateFor,
  workload,
}: {
  leaves: InstancePrice[];
  priceMode: PriceMode;
  rateFor: RateLookup;
  workload: Workload;
}) {
  const norm = priceMode === "normalized";
  const allIn = priceMode === "storage" || priceMode === "total";
  const headline = (l: InstancePrice): number | null => {
    if (norm) return l.perVcpuHourUSD;
    if (allIn) return totalInUnit(l, rateFor(l.provider), workload, "monthly");
    return priceInUnit(l, priceMode);
  };
  const prices = leaves
    .map(headline)
    .filter((v): v is number => v != null && Number.isFinite(v));
  const vcpus = allIn
    ? []
    : leaves
        .map((l) => (norm ? l.perVcpuHourUSD : perVcpuInUnit(l, priceMode)))
        .filter((v): v is number => v != null && Number.isFinite(v));
  if (prices.length === 0) return null;
  const minP = Math.min(...prices);
  const minV = vcpus.length ? Math.min(...vcpus) : null;
  const fmtMode: PriceMode = allIn ? "monthly" : priceMode;
  const fp = (v: number) => (norm ? fmtUSD(v, 4) : fmtMoney(v, fmtMode));
  return (
    <span className="group-meta">
      from <b>{fp(minP)}</b>
      {norm ? "/vCPU-hr" : allIn ? " all-in/mo" : ""}
      {!norm && !allIn && minV != null && (
        <>
          {" · "}best {fmtMoney(minV, priceMode)}/vCPU·{unitWord(priceMode)}
        </>
      )}
    </span>
  );
}

// The all-in (compute + storage + egress) headline column. Shares id "ondemand"
// so the table's default sort + heat-map styling apply uniformly across views.
function totalColumn(
  rateFor: RateLookup,
  workload: Workload,
  bounds: { min: number; max: number },
): ColumnDef<InstancePrice> {
  return {
    id: "ondemand",
    header: "Total $/mo",
    accessorFn: (r) => totalInUnit(r, rateFor(r.provider), workload, "monthly") ?? Infinity,
    aggregationFn: "min",
    size: 132,
    cell: ({ row }) => {
      const v = totalInUnit(row.original, rateFor(row.original.provider), workload, "monthly");
      return (
        <span
          className="cell-heat"
          style={{ background: v == null ? "transparent" : heatColor(v, bounds.min, bounds.max) }}
        >
          {fmtMoney(v, "monthly")}
        </span>
      );
    },
  };
}

function commitTotalColumn(
  term: Term,
  rateFor: RateLookup,
  workload: Workload,
): ColumnDef<InstancePrice> {
  return {
    id: `${term}-total`,
    header: `${term} Total $/mo`,
    accessorFn: (r) => commitTotalInUnit(r, rateFor(r.provider), workload, term, "monthly") ?? Infinity,
    size: 132,
    cell: ({ row }) => {
      const v = commitTotalInUnit(row.original, rateFor(row.original.provider), workload, term, "monthly");
      if (v == null) return <span className="muted">—</span>;
      const disc = discountFor(row.original, term);
      return (
        <span className="commit-cell">
          {fmtMoney(v, "monthly")}
          {disc != null && <span className="disc">-{Math.round(disc * 100)}%</span>}
        </span>
      );
    },
  };
}

// Where a row's priced storage came from: a Hetzner-matched size, the user's
// override, Hetzner's free local disk, or the provider's default boot disk.
function gbSource(r: InstancePrice, wl: Workload): string {
  if (r.provider === "hetzner" || r.includedRef === "self")
    return "bundled local disk (free)";
  if (wl.matchHetzner) {
    const ref = r.includedRef?.startsWith("hetzner:")
      ? r.includedRef.slice("hetzner:".length)
      : null;
    return ref ? `matched to Hetzner ${ref}` : "matched to Hetzner";
  }
  if (wl.storageGiB != null) return "your override (applied to all)";
  return "provider default boot disk (billed)";
}

function commitColumn(term: Term, mode: PriceMode): ColumnDef<InstancePrice> {
  return {
    id: term,
    header: `${term} ${unitSuffix(mode)}`,
    accessorFn: (r) => commitInUnit(r, term, mode) ?? Infinity,
    size: 132,
    cell: ({ row }) => {
      const v = commitInUnit(row.original, term, mode);
      if (v == null) return <span className="muted">—</span>;
      const disc = discountFor(row.original, term);
      return (
        <span className="commit-cell">
          {fmtMoney(v, mode)}
          {disc != null && <span className="disc">-{Math.round(disc * 100)}%</span>}
        </span>
      );
    },
  };
}
