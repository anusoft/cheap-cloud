import { useMemo, useRef, useState } from "react";
import {
  type ColumnDef,
  type SortingState,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { InstancePrice } from "@cheap-cloud/schema";
import {
  type PriceMode,
  type Term,
  PROVIDER_COLORS,
  PROVIDER_LABELS,
  commitInUnit,
  discountFor,
  fmtMoney,
  fmtUSD,
  heatColor,
  priceInUnit,
  unitSuffix,
} from "../lib/view";

interface Props {
  rows: InstancePrice[];
  priceMode: PriceMode;
  pinned: Set<string>;
  onTogglePin: (id: string) => void;
}

export function ComparisonTable({ rows, priceMode, pinned, onTogglePin }: Props) {
  const [sorting, setSorting] = useState<SortingState>([
    { id: "ondemand", desc: false },
  ]);

  // Heat-map bounds for the on-demand price across the visible rows.
  const bounds = useMemo(() => {
    const vals = rows
      .map((r) => (priceMode === "normalized" ? r.perVcpuHourUSD : priceInUnit(r, priceMode)))
      .filter((v): v is number => v != null && Number.isFinite(v));
    return { min: Math.min(...vals), max: Math.max(...vals) };
  }, [rows, priceMode]);

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
    } else {
      const suffix = unitSuffix(priceMode);
      cols.push(
        {
          id: "ondemand",
          header: `On-demand ${suffix}`,
          accessorFn: (r) => priceInUnit(r, priceMode) ?? Infinity,
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
  }, [priceMode, bounds, pinned, onTogglePin]);

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const tableRows = table.getRowModel().rows;
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: tableRows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 34,
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
            return (
              <tr
                key={row.id}
                data-index={vi.index}
                ref={virtualizer.measureElement}
                className={pinned.has(row.original.id) ? "pinned" : ""}
                style={{ transform: `translateY(${vi.start}px)` }}
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
