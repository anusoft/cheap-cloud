# Official pricing data sources

Every fetcher pulls from the provider's **official** pricing API. Region codes for
Bangkok live in `packages/fetchers/src/regions.ts`; adding a region is a one-line
change there. Confidence (`confirmed` vs `proxy`) is attached to every row.

| Provider | Bangkok region | Auth | Confidence |
|---|---|---|---|
| AWS | `ap-southeast-7` | none (public) | confirmed |
| Google Cloud | `asia-southeast3` | API key | confirmed |
| Azure | `southeastasia` (proxy) | none (public) | **proxy** (no GA TH region) |
| Alibaba | `ap-southeast-7` | AccessKey/Secret | confirmed |
| Tencent | `ap-bangkok` | SecretId/Key | confirmed |
| Huawei | `ap-southeast-2` | AK/SK (+ project id) | confirmed |

---

## AWS — Price List Bulk JSON API · `providers/aws.ts`
- **Endpoint**: `region_index.json` → per-region `index.json` under
  `pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonEC2/current/`.
- **Auth**: none. **Verified live** (m7i.large = $0.1071/hr, matching research).
- **Filters**: `productFamily=Compute Instance`, `operatingSystem=Linux`,
  `tenancy=Shared`, `preInstalledSw=NA`, `capacitystatus=Used`.
- **Commitments**: `terms.Reserved` (standard class); effective hourly =
  hourly + upfront / termHours (1yr=8760, 3yr=26280). Cheapest per term kept.
- **Arch**: Graviton → `arm64`, else `x86_64`.

## Google Cloud — Cloud Billing Catalog API · `providers/gcp.ts`
- **Endpoint**: `cloudbilling.googleapis.com/v1/services/6F81-5844-456A/skus`
  (Compute Engine service id), paginated.
- **Auth**: `GCP_API_KEY` (enable the Cloud Billing API).
- **Method**: keep SKUs whose `serviceRegions` contains `asia-southeast3` and
  `resourceFamily=Compute`; classify each as a **Core** or **Ram** SKU per family
  token (E2, N2, N2D, C2, C2D, C3, C4, T2D, T2A, N4). GCP bills vCPU and RAM
  separately, so these are **native** per-vCPU / per-GB rates. Standard shapes
  (`gcp-shapes.ts`) get price = core·vCPU + ram·GiB. `Commit1Yr`/`Commit3Yr`
  SKUs yield resource-based CUD commitments.

## Azure — Retail Prices API · `providers/azure.ts`
- **Endpoint**: `prices.azure.com/api/retail/prices` with
  `$filter=serviceName eq 'Virtual Machines' and armRegionName eq 'southeastasia'
  and priceType eq 'Consumption'`, paginated via `NextPageLink`.
- **Auth**: none. **Verified live**.
- **Note**: Thailand has **no GA Azure region** (announced 2026–2028) → Southeast
  Asia proxy, flagged `confidence: proxy`. The Retail API has no vCPU/RAM, so rows
  are joined to a curated size table (`azure-sizes.ts`); unmatched sizes skipped.

## Alibaba Cloud — ECS RPC API · `providers/alibaba.ts`
- **Endpoints**: `DescribeInstanceTypes` (specs) + `DescribePrice` per type
  (RegionId `ap-southeast-7`), HMAC-SHA1 RPC v1 signing (`sign/alibaba.ts`).
- **Auth**: `ALIBABA_ACCESS_KEY_ID` / `ALIBABA_ACCESS_KEY_SECRET`.
- **Note**: no bulk price endpoint exists, so price is fetched per instance type;
  bounded to current-gen g7/c7/r7/g8/c8 families (concurrency-limited).

## Tencent Cloud — CVM API · `providers/tencent.ts`
- **Endpoint**: `DescribeZoneInstanceConfigInfos` (region `ap-bangkok`) — returns
  specs + postpaid unit price in one call. TC3-HMAC-SHA256 signing
  (`sign/tencent.ts`).
- **Auth**: `TENCENT_SECRET_ID` / `TENCENT_SECRET_KEY`.

## Huawei Cloud — ECS flavors + published unit rates · `providers/huawei.ts`
- **Specs**: ECS `cloudservers/flavors` (region `ap-southeast-2`), SDK-HMAC-SHA256
  signing (`sign/huawei.ts`). Needs `HUAWEI_ACCESS_KEY`/`HUAWEI_SECRET_KEY`/
  `HUAWEI_PROJECT_ID`; falls back to a built-in C9/M9 catalog otherwise.
- **Price**: Huawei publishes **linear unit rates** for Bangkok
  ($0.0569/vCPU-hr, $0.014225/GiB-hr — overridable via `HUAWEI_RATE_VCPU` /
  `HUAWEI_RATE_RAM`). The live per-resource list price is the BSS
  `bills/ratings/on-demand-resources` rating API (account/project specific) — the
  hook to enable it lives in this fetcher.

---

## Commitment / savings pricing (1yr & 3yr)

Every provider exposes committed-use pricing through its official API; we amortize
each to an **effective hourly** rate and a discount vs on-demand, stored on
`InstancePrice.commitments[]` and surfaced as the **1yr** and **3yr** table columns.

| Provider | Mechanism | Source |
|---|---|---|
| AWS | Reserved Instances (standard, 1yr/3yr) | `terms.Reserved`; effective = hourly + upfront/termHours |
| GCP | Resource-based CUD (1yr/3yr) | `Commit1Yr`/`Commit3Yr` Core+Ram SKUs |
| Azure | Savings Plan for compute (1yr/3yr) | `savingsPlan[]` on the consumption item (`api-version=2023-01-01-preview`) |
| Alibaba | Subscription / PrePaid (1yr/3yr) | `DescribePrice` `PriceUnit=Year` `Period=1\|3`, amortized |
| Tencent | Subscription / PrePaid (1yr/3yr) | `DescribeZoneInstanceConfigInfos` PREPAID `DiscountPriceOneYear` / `DiscountPriceThreeYears` |
| Huawei | Yearly subscription (1yr) | published 16.7% (two months free); 3yr not modeled |

Typical observed depth: AWS/GCP/Azure ~30–40% (1yr) and ~50–55% (3yr); Alibaba and
Tencent subscriptions run deeper (~50% / ~65%). AWS Compute Savings Plans (a separate
price list) are comparable to RIs and not separately ingested in v1.

## Normalization
Fixed-shape providers (AWS, Azure, Alibaba, Tencent) don't expose per-vCPU/per-GB
rates, so `applyNormalization` (in `@cheap-cloud/schema`) fits
`price = a·vCPU + b·GiB` by least squares **per (provider, family)** and back-fills
each row. GCP and Huawei carry native unit rates and are left untouched.

## Out of scope (v1)
Block storage ($/GB-mo) and network egress ($/GB) are documented in the research
but not yet fetched; the schema leaves room to add them as sibling datasets.
