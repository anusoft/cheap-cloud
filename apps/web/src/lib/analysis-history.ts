import type { InstancePrice } from "@cheap-cloud/schema";

export interface HetznerPriceChange {
  instanceName: string;
  vcpu: number;
  ramGiB: number;
  oldMonthlyUSD: number;
  currentMonthlyUSD: number;
  deltaUSD: number;
  deltaPct: number;
}

function monthly(row: InstancePrice): number | null {
  return row.monthlyUSD != null && row.monthlyUSD > 0 ? row.monthlyUSD : null;
}

export function hetznerPriceChanges(
  currentRows: InstancePrice[],
  previousRows: InstancePrice[],
): HetznerPriceChange[] {
  const previous = new Map(
    previousRows
      .filter((row) => row.provider === "hetzner")
      .flatMap((row) => {
        const price = monthly(row);
        return price == null ? [] : [[row.instanceName, { row, price }] as const];
      }),
  );

  return currentRows
    .filter((row) => row.provider === "hetzner")
    .flatMap((row) => {
      const currentMonthlyUSD = monthly(row);
      const old = previous.get(row.instanceName);
      if (currentMonthlyUSD == null || !old) return [];
      const deltaUSD = currentMonthlyUSD - old.price;
      return [
        {
          instanceName: row.instanceName,
          vcpu: row.vcpu,
          ramGiB: row.ramGiB,
          oldMonthlyUSD: old.price,
          currentMonthlyUSD,
          deltaUSD,
          deltaPct: deltaUSD / old.price,
        },
      ];
    })
    .sort((a, b) => b.deltaPct - a.deltaPct || b.deltaUSD - a.deltaUSD);
}
