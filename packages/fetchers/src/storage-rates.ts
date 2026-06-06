import type { ProviderId, ProviderRate } from "@cheap-cloud/schema";

// ─────────────────────────────────────────────────────────────────────────────
// Published storage & egress rate baseline.
//
// Most providers' compute-pricing APIs (the ones the fetchers call) do NOT
// return block-storage or egress prices — there is no clean public endpoint for
// several of them. So, exactly like the Huawei compute fetcher publishes linear
// unit rates with a live-override hook, we keep a committed baseline of
// representative published-list rates here. A fetcher's optional `rates()` can
// override any subset of these with a live API pull (e.g. Hetzner reads its real
// bundled disk; Azure can query the Retail Prices API); the CLI merges the live
// partial over this baseline.
//
// Figures are general-purpose SSD block storage ($/GB-month) and first-tier
// internet egress ($/GB) for the Singapore / Bangkok area, approximate and
// snapshotted early 2026. They are intentionally transparent and easy to edit;
// `rateSource: "published"` flags them in the UI as list-price estimates.
// ─────────────────────────────────────────────────────────────────────────────

type Baseline = Omit<ProviderRate, "provider" | "rateSource">;

const GiB_PER_TiB = 1024;

export const PUBLISHED_RATES: Record<ProviderId, Baseline> = {
  aws: {
    storagePerGbMonthUSD: 0.096, // EBS gp3 (ap-southeast)
    storageClass: "gp3 SSD (EBS)",
    bundledStorageGiB: 8, // typical Linux AMI root volume (EBS, billed)
    bundledStorageFree: false,
    egressPerGbUSD: 0.09, // first 10 TB/mo to internet
    freeEgressGiB: 100, // 100 GB/mo free egress (account-wide)
    note: "EBS gp3 + internet egress, published list price",
    url: "https://aws.amazon.com/ebs/pricing/",
  },
  gcp: {
    storagePerGbMonthUSD: 0.1, // pd-balanced
    storageClass: "PD balanced",
    bundledStorageGiB: 10, // default boot disk (balanced PD, billed)
    bundledStorageFree: false,
    egressPerGbUSD: 0.12, // standard-tier internet egress
    freeEgressGiB: 200,
    note: "Persistent Disk balanced + internet egress, published list price",
    url: "https://cloud.google.com/compute/disks-image-pricing",
  },
  azure: {
    storagePerGbMonthUSD: 0.075, // Standard SSD managed disk
    storageClass: "Standard SSD",
    bundledStorageGiB: 30, // typical Linux managed OS disk (billed)
    bundledStorageFree: false,
    egressPerGbUSD: 0.087,
    freeEgressGiB: 100,
    note: "Managed disk + bandwidth, published list price",
    url: "https://azure.microsoft.com/en-us/pricing/details/managed-disks/",
  },
  alibaba: {
    storagePerGbMonthUSD: 0.1, // ESSD PL1
    storageClass: "ESSD PL1",
    bundledStorageGiB: 40, // default ECS system disk (billed)
    bundledStorageFree: false,
    egressPerGbUSD: 0.12, // pay-by-traffic
    freeEgressGiB: 0,
    note: "ESSD cloud disk + pay-by-traffic egress, published list price",
    url: "https://www.alibabacloud.com/product/disk",
  },
  tencent: {
    storagePerGbMonthUSD: 0.1, // CBS SSD
    storageClass: "SSD CBS",
    bundledStorageGiB: 50, // CVM recommended/default system disk (live via DescribeDiskConfigQuota; billed)
    bundledStorageFree: false,
    egressPerGbUSD: 0.12, // bill-by-traffic
    freeEgressGiB: 0,
    note: "Cloud Block Storage SSD + bill-by-traffic egress, published list price",
    url: "https://www.tencentcloud.com/products/cbs",
  },
  huawei: {
    storagePerGbMonthUSD: 0.1, // EVS SSD
    storageClass: "EVS SSD",
    bundledStorageGiB: 40, // default ECS system disk (billed)
    bundledStorageFree: false,
    egressPerGbUSD: 0.1,
    freeEgressGiB: 0,
    note: "Elastic Volume Service SSD + egress, published list price",
    url: "https://www.huaweicloud.com/intl/en-us/pricing/",
  },
  hetzner: {
    storagePerGbMonthUSD: 0.048, // Volume €0.044/GB-mo ≈ $0.048; local disk is bundled (free)
    storageClass: "Volume SSD (local disk bundled free)",
    bundledStorageGiB: 40, // fallback; real per-shape disk comes from the row
    bundledStorageFree: true, // local NVMe is included with the instance
    egressPerGbUSD: 0.0012, // ≈ €1.19/TB beyond the included allowance
    freeEgressGiB: 20 * GiB_PER_TiB, // 20 TB/mo included per server
    note: "Local NVMe bundled free; 20 TB/mo egress included, then ~$1.20/TB",
    url: "https://www.hetzner.com/cloud",
  },
};

/** The committed published rate for a provider, as a full ProviderRate row. */
export function publishedRate(provider: ProviderId): ProviderRate {
  return { provider, rateSource: "published", ...PUBLISHED_RATES[provider] };
}

/** Merge a live partial (any subset of fields) over the published baseline. */
export function mergeRate(
  provider: ProviderId,
  live: Partial<Omit<ProviderRate, "provider">> | null | undefined,
): ProviderRate {
  const base = publishedRate(provider);
  if (!live) return base;
  return { ...base, ...live, provider };
}
