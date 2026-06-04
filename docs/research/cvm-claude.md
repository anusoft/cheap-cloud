# Cloud Compute Pricing Comparison: Thailand / Bangkok Regions (June 2026)

## TL;DR
- **Five providers now run generally-available cloud regions in Thailand**: AWS Asia Pacific (Thailand) `ap-southeast-7` (GA January 8, 2025; live Jan 7), Google Cloud Bangkok `asia-southeast3` (GA January 21, 2026), plus Alibaba Cloud (`ap-southeast-7`, first data center 2022 and second on February 13, 2025), Tencent Cloud (Bangkok, 2 AZs, since 2021) and Huawei Cloud (AP-Bangkok, since 2018). **Microsoft Azure has announced but NOT launched** a Thailand region as of June 2026.
- **AWS is the only provider publishing fully transparent, Thailand-specific on-demand pricing**: a general-purpose m7i.large (2 vCPU/8 GB) costs **$0.1071/hr** in Bangkok (~6.25% above us-east-1's $0.1008/hr), translating to roughly **$0.0536 per vCPU-hour (bundled with 4 GB RAM)**. Google Cloud's Bangkok region is GA but its Bangkok-specific rates are served only behind its interactive calculator; the best public estimate (Singapore proxy) is **~$0.24/hr for n2-standard-4 (4 vCPU/16 GB)**.
- **On headline list price the Chinese providers (Alibaba, Tencent, Huawei) appear cheapest**, but none publishes static Bangkok-specific public pricing, so those numbers are proxies and must be verified in-console. For a buyer needing confirmed, contractually-clear Thailand pricing today, **AWS offers the best-documented value; Google Cloud's E2 family is the most aggressive among the Western hyperscalers** once Bangkok rates are confirmed in-console.

## Key Findings

### Region availability (confirmed)
| Provider | Region name | API/region code | Status | AZs | Launched |
|---|---|---|---|---|---|
| AWS | Asia Pacific (Thailand) | `ap-southeast-7` | **GA** | 3 | Jan 8, 2025 (live Jan 7) |
| Google Cloud | Bangkok | `asia-southeast3` | **GA** | 3 | Jan 21, 2026 |
| Alibaba Cloud | Thailand (Bangkok) | `ap-southeast-7` | **GA** (2 data centers) | — | 2022; 2nd DC Feb 13, 2025 |
| Tencent Cloud | Bangkok (Thailand) | (Bangkok) | **GA** | 2 | 2021 |
| Huawei Cloud | AP-Bangkok | AP-Bangkok | **GA** | 3 | 2018 |
| Microsoft Azure | Thailand (planned) | n/a | **Announced, not GA** | (3 planned) | Intent announced May 1, 2024; reaffirmed Mar 31, 2026 |

Notes:
- AWS's launch was confirmed by its Press Center: "Bangkok – January 8, 2025 – Amazon Web Services (AWS) today announced the launch of the AWS Asia Pacific (Thailand) Region," with "three Availability Zones and API name ap-southeast-7." AWS plans to invest more than $5 billion in Thailand (≈190 billion baht by 2037), adding approximately $10 billion to GDP and supporting an average of 11,000+ FTE jobs annually.
- Google Cloud's launch was confirmed by its Press Corner: "BANGKOK, Jan. 21, 2026 – Google Cloud today announced the launch of its new cloud region in Thailand" — a US$1 billion investment with three zones, projected to add "THB 1.4 trillion (US$41 billion) in economic value … over the next five years."
- Azure's Thailand intent was announced by CEO Satya Nadella at Microsoft Build AI Day Bangkok (May 1, 2024) and reaffirmed March 31, 2026 with a "more than US$1 billion" cloud/AI data-center commitment — still not GA as of June 2026.
- Both AWS and Alibaba label their (separate) Thailand regions "ap-southeast-7" — a coincidence of naming conventions, not a shared region.

### Pricing data (on-demand, Linux, USD)

**AWS — Asia Pacific (Thailand) `ap-southeast-7`** (confirmed, official-derived):
| Instance | Family | vCPU | RAM (GB) | On-demand $/hr | ~Monthly (730h) |
|---|---|---|---|---|---|
| m7i.large | General purpose | 2 | 8 | $0.1071 | $78.18 |
| m7i.xlarge | General purpose | 4 | 16 | $0.2142 | $156.37 |
| c7i.large* | Compute optimized | 2 | 4 | ~$0.0949 | ~$69 |
| r7i.large* | Memory optimized | 2 | 16 | ~$0.1406 | ~$103 |

m7i Thailand prices are directly confirmed (m7i.large at $0.1071/hr vs $0.1008/hr in us-east-1). *c7i/r7i Thailand figures are derived by applying the confirmed ~6.25% Thailand premium to AWS's published us-east-1 structure.

**Google Cloud — Bangkok `asia-southeast3`** (region GA; figures via Singapore proxy / family base — FLAGGED, not Bangkok-confirmed):
| Instance | Family | vCPU | RAM (GB) | On-demand $/hr (est.) |
|---|---|---|---|---|
| e2-standard-4 | General purpose (cost-optimized) | 4 | 16 | ~$0.134–0.151 |
| n2-standard-4 | General purpose | 4 | 16 | ~$0.24 (Singapore = $0.2396) |

**Regional Chinese providers** (region GA, but Bangkok-specific public pricing not statically published — proxies FLAGGED):
| Provider | Instance | vCPU | RAM (GB) | $/hr (proxy) | Proxy basis |
|---|---|---|---|---|---|
| Alibaba Cloud | ecs.g7.xlarge | 4 | 16 | from ~$0.038 | non-Thailand base |
| Tencent Cloud | Standard S5 (S5.MEDIUM2) | 2 | 2 | $0.04 (Linux) | official Singapore example |
| Huawei Cloud | S7 general computing | 2–4 | 4–16 | not published | — |

### Custom machine configurations
- **Google Cloud** is the only provider offering true per-unit custom machine types: you specify vCPU and RAM independently. Scaling the N2 us-central1 base (~$0.0316/vCPU-hr, ~$0.0042/GB-hr) by the ~1.23× Singapore factor gives approximate Bangkok custom rates of **~$0.039 per vCPU-hour and ~$0.0052 per GB-hour**, plus a 5% custom-type premium; memory above 8 GB/vCPU is billed at extended-memory rates.
- **AWS** does not price vCPU and RAM as independent units; it offers "Optimize CPUs" (reduce vCPU count) but charges the full instance price regardless.
- **Alibaba, Tencent, Huawei** sell fixed instance shapes; no public per-vCPU/per-GB unit pricing.

### Discounts available in Thailand
- **AWS** (`ap-southeast-7`, confirmed from m7i.large data): 1-year Reserved/Savings ≈ **34% off** ($51.72 vs $78.18/mo); 3-year all-upfront ≈ **60% off** ($30.86/mo); Spot ≈ **62% off** ($0.0405/hr). Compute Savings Plans apply flexibly across families/regions; EC2 Instance Savings Plans give a deeper discount but lock the family.
- **Google Cloud**: Sustained Use Discounts auto-apply (up to ~20% effective for full-month N2 use); Committed Use Discounts ≈ **up to 37% (1-yr) / 55% (3-yr)** resource-based for general-purpose (70% on 3-yr for memory-optimized), and 28% (1-yr)/46% (3-yr) for flexible spend commitments; Spot 60–91% off. CUD percentages are flat across all regions including Bangkok.
- **Alibaba Cloud**: subscription, Savings Plans up to ~70%, Reserved Instances up to ~79%, Spot.
- **Tencent Cloud**: monthly/annual subscription (~19–50% vs pay-as-you-go), reserved instances, spot; 3-tiered pay-as-you-go (tier-2 = 50%, tier-3 = 34% of tier-1).
- **Huawei Cloud**: yearly/monthly subscription discounts, pay-per-use, spot.

## Details

### Methodology for per-vCPU / per-GB normalization
All figures normalized to **USD, on-demand, Linux, shared tenancy**. Two methods used:

1. **Simple division (general-purpose instance):** Take a general-purpose m-series-equivalent VM (4 GB RAM per vCPU) and divide the instance price by vCPU count, treating each vCPU as bundled with 4 GB RAM. Example: AWS m7i.large Thailand $0.1071/hr ÷ 2 vCPU = **$0.0536 per vCPU-hour (incl. 4 GB)**.
2. **Two-family regression (vCPU vs GB split):** Solve `price = a·vCPU + b·GB` across general-purpose (4 GB/vCPU) and compute-optimized (2 GB/vCPU) families. Using AWS us-east-1 anchors (m7i.large confirmed at $0.1008/hr — "$73.58/mo"; c7i.large ≈ $0.08925) yields **a ≈ $0.0389/vCPU-hr, b ≈ $0.00289/GB-hr**; scaled by the Thailand premium (×1.0625) gives **~$0.0413/vCPU-hr and ~$0.00307/GB-hr** for AWS Thailand.

For Google Cloud, the provider publishes explicit vCPU/GB rates; scaling the N2 us-central1 base ($0.031611/vCPU-hr, $0.004237/GB-hr) by the Singapore factor (~1.23×) gives Bangkok estimates of **~$0.039/vCPU-hr and ~$0.0052/GB-hr**, which reconcile with the ~$0.24/hr n2-standard-4 figure.

### Normalized comparison (4 vCPU / 16 GB general-purpose VM, USD/hr on-demand, Linux)
| Provider | Instance | $/hr | Per vCPU (incl. 4 GB) | Confidence |
|---|---|---|---|---|
| Google Cloud (E2) | e2-standard-4 | ~$0.134–0.151 | ~$0.034–0.038 | Proxy (Bangkok GA, rate via family base) |
| AWS | m7i.xlarge | $0.2142 | $0.0536 | **Confirmed Thailand** |
| Google Cloud (N2) | n2-standard-4 | ~$0.24 | ~$0.060 | Proxy (Singapore = $0.2396) |
| Alibaba Cloud | ecs.g7.xlarge | from ~$0.038 | ~$0.0095 | Proxy (non-Thailand base) |
| Tencent Cloud | ~2× S5 2C | ~$0.08–0.12 (est.) | ~$0.02–0.03 | Proxy (Singapore/HK) |

The Chinese-provider per-unit figures look dramatically lower, but they (a) are not confirmed for Bangkok, and (b) often reflect lower-spec/older silicon and narrower managed-service ecosystems. AWS's figure is the only one fully confirmed for Thailand and reflects current-generation Intel Sapphire Rapids.

### Why Bangkok-specific figures are hard to pin down
Google, Alibaba, Tencent and Huawei all serve compute prices through JavaScript-rendered interactive calculators that require interactive region selection; static text pages return only region-selector menus. AWS is the exception — its public price list is machine-readable and mirrored by third-party trackers (Vantage, aws-pricing.com), enabling confirmed `ap-southeast-7` figures. As a result, this comparison can state AWS Thailand prices with high confidence but must flag all other Bangkok figures as proxies pending in-console confirmation.

## Recommendations

**Stage 1 — If you need confirmed, contract-ready Thailand pricing today:** Choose **AWS `ap-southeast-7`**. It is the only region with transparent, current-generation, Thailand-specific public pricing, three AZs, and a full discount stack (Savings Plans/RIs up to ~60%, Spot ~62%). Baseline a general-purpose fleet on m7i (or m7g Graviton for ~15–20% lower list price if your stack is ARM-compatible).

**Stage 2 — If cost-per-vCPU is paramount and you can validate in-console:** Price out **Google Cloud Bangkok E2** instances (estimated ~$0.134–0.151/hr for 4 vCPU/16 GB) and use **custom machine types** to buy exactly the vCPU:RAM ratio you need (~$0.039/vCPU-hr + ~$0.0052/GB-hr). E2 is the most aggressive Western-hyperscaler rate, and Bangkok is fully GA as of Jan 21, 2026.

**Stage 3 — If you are cost-driven, China-market-adjacent, or already on a Chinese cloud:** Obtain live quotes from **Alibaba Cloud (ap-southeast-7)**, **Tencent (Bangkok)** and **Huawei (AP-Bangkok)** via their consoles with the Thailand region explicitly selected. Their list prices appear materially lower, but confirm (a) Bangkok-specific rates, (b) current-generation silicon, and (c) service parity for the managed services you need before committing.

**Decision thresholds that would change this guidance:**
- If **Azure launches its Thailand region GA** with competitive D/E/F-series pricing, re-evaluate (Azure is announced but not live).
- If your workload runs **>60% utilization steady-state**, commitment-discount depth (AWS 3-yr ~60%, GCP 3-yr ~55%, Alibaba RI ~79%) matters more than on-demand list price — re-rank on committed rates rather than on-demand.
- If **data residency under Thailand's PDPA** is the binding constraint, all five GA providers qualify; pick on price/ecosystem fit.

## Caveats
- **Azure is not GA in Thailand** as of June 2026; any Azure D/E/F-series pricing would come from a non-Thailand proxy region and is excluded here.
- **Only AWS pricing is confirmed Thailand-specific.** Google Cloud Bangkok is GA but its exact rates were not extractable from static sources; the ~$0.24/hr n2-standard-4 figure uses Singapore ($0.2396/hr) as a proxy. All Alibaba, Tencent, and Huawei figures are proxies from other regions and must be verified in-console.
- **Derived AWS c7i/r7i Thailand figures** apply the confirmed ~6.25% Thailand premium to AWS's published structure; only m-series is directly confirmed.
- **Regression-based per-vCPU/per-GB splits are estimates**, sensitive to which families anchor the regression; memory-optimized (r-series) instances carry a premium that a two-family fit understates.
- Prices exclude EBS/persistent-disk storage, network egress, OS licensing beyond Linux, and taxes/VAT. Currency: all figures USD; AWS and the Chinese providers bill in USD by default (local THB billing may be available).
- Cloud pricing is volatile; verify against official calculators immediately before procurement.