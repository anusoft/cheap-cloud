import type { Arch, Family } from "@cheap-cloud/schema";

export interface GcpShape {
  name: string; // n2-standard-4
  familyToken: string; // matches SKU descriptions: E2, N2, N2D, C2, C2D, C3, C4, T2D, T2A, N4
  vcpu: number;
  ramGiB: number;
  family: Family;
  arch: Arch;
}

// Predefined machine types whose on-demand price = core*vcpu + ram*GiB
// (shared-core e2-micro/small/medium are intentionally excluded — they use a
// fixed per-VM price, not the linear core/RAM formula). The fetcher only emits
// a shape when it found OnDemand Core+Ram SKUs for that family token in-region.
function gen(
  token: string,
  prefix: string,
  arch: Arch,
  family: Family,
  ratio: number,
  sizes: number[],
): GcpShape[] {
  return sizes.map((vcpu) => ({
    name: `${prefix}-${vcpu}`,
    familyToken: token,
    vcpu,
    ramGiB: vcpu * ratio,
    family,
    arch,
  }));
}

export const GCP_SHAPES: GcpShape[] = [
  // E2 (general / Intel-AMD mix)
  ...gen("E2", "e2-standard", "x86_64", "general", 4, [2, 4, 8, 16, 32]),
  ...gen("E2", "e2-highmem", "x86_64", "memory", 8, [2, 4, 8, 16]),
  ...gen("E2", "e2-highcpu", "x86_64", "compute", 1, [2, 4, 8, 16, 32]),
  // N2 (general / Intel)
  ...gen("N2", "n2-standard", "x86_64", "general", 4, [2, 4, 8, 16, 32]),
  ...gen("N2", "n2-highmem", "x86_64", "memory", 8, [2, 4, 8, 16]),
  ...gen("N2", "n2-highcpu", "x86_64", "compute", 1, [2, 4, 8, 16, 32]),
  // N2D (general / AMD)
  ...gen("N2D", "n2d-standard", "x86_64", "general", 4, [2, 4, 8, 16, 32]),
  // C2 / C2D (compute optimized)
  ...gen("C2", "c2-standard", "x86_64", "compute", 4, [4, 8, 16, 30]),
  ...gen("C2D", "c2d-standard", "x86_64", "compute", 4, [2, 4, 8, 16, 32]),
  // C3 / C4 (latest general)
  ...gen("C3", "c3-standard", "x86_64", "general", 4, [4, 8, 22, 44]),
  ...gen("C4", "c4-standard", "x86_64", "general", 3.875, [2, 4, 8, 16]),
  // T2D (Tau / AMD), T2A (Tau / Arm Ampere)
  ...gen("T2D", "t2d-standard", "x86_64", "general", 4, [1, 2, 4, 8, 16]),
  ...gen("T2A", "t2a-standard", "arm64", "general", 4, [1, 2, 4, 8, 16]),
  // N4 (general / Intel Emerald Rapids)
  ...gen("N4", "n4-standard", "x86_64", "general", 4, [2, 4, 8, 16]),
];
