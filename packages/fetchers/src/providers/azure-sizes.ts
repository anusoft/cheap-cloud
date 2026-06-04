import type { Arch, Family } from "@cheap-cloud/schema";

export interface AzureSpec {
  vcpu: number;
  ramGiB: number;
  family: Family;
  arch: Arch;
}

// Curated specs for common Azure VM sizes (the Retail Prices API does not
// return vCPU/RAM). Keyed by armSkuName. Covers B/D/E/F current-gen families;
// extend as needed. Sizes not in this map are skipped (Azure is a proxy region).
export const AZURE_SIZES: Record<string, AzureSpec> = {
  // B-series (burstable)
  Standard_B1s: { vcpu: 1, ramGiB: 1, family: "burstable", arch: "x86_64" },
  Standard_B1ms: { vcpu: 1, ramGiB: 2, family: "burstable", arch: "x86_64" },
  Standard_B2s: { vcpu: 2, ramGiB: 4, family: "burstable", arch: "x86_64" },
  Standard_B2ms: { vcpu: 2, ramGiB: 8, family: "burstable", arch: "x86_64" },
  Standard_B4ms: { vcpu: 4, ramGiB: 16, family: "burstable", arch: "x86_64" },
  Standard_B8ms: { vcpu: 8, ramGiB: 32, family: "burstable", arch: "x86_64" },

  // Dv5 (general purpose, Intel)
  Standard_D2s_v5: { vcpu: 2, ramGiB: 8, family: "general", arch: "x86_64" },
  Standard_D4s_v5: { vcpu: 4, ramGiB: 16, family: "general", arch: "x86_64" },
  Standard_D8s_v5: { vcpu: 8, ramGiB: 32, family: "general", arch: "x86_64" },
  Standard_D16s_v5: { vcpu: 16, ramGiB: 64, family: "general", arch: "x86_64" },
  Standard_D32s_v5: { vcpu: 32, ramGiB: 128, family: "general", arch: "x86_64" },

  // Dpsv5 (general purpose, Ampere Arm)
  Standard_D2ps_v5: { vcpu: 2, ramGiB: 8, family: "general", arch: "arm64" },
  Standard_D4ps_v5: { vcpu: 4, ramGiB: 16, family: "general", arch: "arm64" },
  Standard_D8ps_v5: { vcpu: 8, ramGiB: 32, family: "general", arch: "arm64" },
  Standard_D16ps_v5: { vcpu: 16, ramGiB: 64, family: "general", arch: "arm64" },

  // Ev5 (memory optimized, Intel)
  Standard_E2s_v5: { vcpu: 2, ramGiB: 16, family: "memory", arch: "x86_64" },
  Standard_E4s_v5: { vcpu: 4, ramGiB: 32, family: "memory", arch: "x86_64" },
  Standard_E8s_v5: { vcpu: 8, ramGiB: 64, family: "memory", arch: "x86_64" },
  Standard_E16s_v5: { vcpu: 16, ramGiB: 128, family: "memory", arch: "x86_64" },
  Standard_E32s_v5: { vcpu: 32, ramGiB: 256, family: "memory", arch: "x86_64" },

  // Fsv2 (compute optimized, Intel)
  Standard_F2s_v2: { vcpu: 2, ramGiB: 4, family: "compute", arch: "x86_64" },
  Standard_F4s_v2: { vcpu: 4, ramGiB: 8, family: "compute", arch: "x86_64" },
  Standard_F8s_v2: { vcpu: 8, ramGiB: 16, family: "compute", arch: "x86_64" },
  Standard_F16s_v2: { vcpu: 16, ramGiB: 32, family: "compute", arch: "x86_64" },
  Standard_F32s_v2: { vcpu: 32, ramGiB: 64, family: "compute", arch: "x86_64" },
};
