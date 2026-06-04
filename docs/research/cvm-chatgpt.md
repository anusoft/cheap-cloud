# Thailand Cloud VM Pricing Research

## Scope and confidence

I focused on major public cloud providers that currently show an active Thailand or Bangkok region in official provider materials, then traced each provider’s official compute pricing page, calculator, or pricing API documentation. The strongest Thailand-region price verification I could extract directly from official sources during this session came from **Tencent Cloud**, plus a **best-effort Google Cloud extract** from official pricing snippets that explicitly mention Bangkok (`asia-southeast3`) but whose full dynamic pricing page did not render cleanly in this browser session. For **AWS, Microsoft Azure, Alibaba Cloud, and Huawei Cloud**, I could confirm active Thailand-region presence and official pricing entry points, but I could not extract enough Bangkok-selected machine rows from the official dynamic pages/APIs to support a full apples-to-apples numeric ranking without overstating confidence. citeturn9view0turn16view0turn19view1turn38search1turn41view0turn79search1turn53view0turn75search0

## Providers with active Thailand regions and official pricing entry points

The official sources I found support six major providers as having an active Thailand-region footprint for public cloud services, or at minimum an official Thailand/Bangkok region selector exposed in their product/pricing materials: **AWS**, **Google Cloud**, **Microsoft Azure**, **Alibaba Cloud**, **Tencent Cloud**, and **Huawei Cloud**. Google’s official compute-related pricing pages list **Bangkok (`asia-southeast3`)** among selectable regions; Tencent’s CVM pricing/API docs list **`ap-bangkok`**; Huawei’s calculator lists **`AP-Bangkok`**; and Alibaba’s ECS pricing list includes **Thailand (Bangkok)** among selectable regions. Official AWS and Azure region pages were also surfaced in the research phase and were used to identify the Thailand region names and existence. citeturn25view0turn53view0turn75search0turn79search1turn0search0turn0search2

The pricing entry points I found are:

| Provider | Active Thailand region evidence | Official compute pricing doc or calculator used |
|---|---|---|
| AWS | Asia Pacific (Thailand) official region listing. citeturn0search0 | AWS EC2 regional Price List API documentation for per-region files. citeturn9view0 |
| Google Cloud | Bangkok (`asia-southeast3`) appears on official Compute pricing pages and selectors. citeturn25view0turn25view1 | VM pricing page and machine-family pricing pages. citeturn16view0turn19view1 |
| Microsoft Azure | Thailand East official region listing. citeturn0search2 | Azure VM pricing page, Pricing Calculator, and Azure Retail Prices API docs. citeturn41view0turn39search4turn38search1 |
| Alibaba Cloud | ECS pricing page exposes Thailand (Bangkok) as a selectable region. citeturn79search1 | Alibaba Cloud ECS pricing list. citeturn78search0turn79search1 |
| Tencent Cloud | `ap-bangkok` is listed in official CVM pricing/API docs. citeturn53view0 | Tencent CVM pricing calculator and CVM price inquiry API. citeturn51search1turn53view0 |
| Huawei Cloud | `AP-Bangkok` appears in the official pricing calculator region list. citeturn75search0 | Huawei Cloud pricing calculator. citeturn50search2turn50search3turn75search0 |

## Verified Bangkok-region VM price extracts

The table below includes **only rows I could defend from official sources in this session**. I separated the confidence levels because the browser handled some providers’ dynamic pricing pages much better than others.

### High-confidence Bangkok extracts

For Tencent Cloud, the official calculator snippets explicitly state **Bangkok** and expose machine rows with vCPU, memory, and hourly pricing. Tencent’s official instance-spec documentation also classifies the families I used as **Standard**, **Computing**, and **Memory-optimized** families. citeturn57search0turn62search0turn65search0turn60search1

| Provider | Family focus | Instance | vCPU | RAM | Price | Normalized cost per vCPU | Normalized cost per GB RAM |
|---|---|---:|---:|---:|---:|---:|---:|
| Tencent Cloud | General-purpose | S5.2XLARGE16 | 8 | 16 GB | **$0.21/hour** | **$0.02625/vCPU-hour** | **$0.01313/GB-hour** |
| Tencent Cloud | Compute-optimized | C5.2XLARGE16 | 8 | 16 GB | **$0.22/hour** | **$0.02750/vCPU-hour** | **$0.01375/GB-hour** |
| Tencent Cloud | Memory-optimized | MA5.2XLARGE64 | 8 | 64 GB | **$0.34/hour** | **$0.04250/vCPU-hour** | **$0.00531/GB-hour** |

These Tencent Cloud prices come directly from the official pricing calculator snippets for **Bangkok**. The calculator also surfaced a lower-cost AMD general-purpose option, **SA5.2XLARGE16**, in Bangkok at **$0.17/hour** for **8 vCPU / 16 GB**, which normalizes to **$0.02125/vCPU-hour** and **$0.01063/GB-hour**; I treat this as a useful additional data point rather than the main representative general-purpose row because it changes the CPU architecture basis. citeturn66search0turn62search0turn65search0turn58search0

### Best-effort official Bangkok extracts

Google Cloud’s official pricing pages were partially accessible. The most reliable Bangkok evidence in-session came from official pricing/search snippets that explicitly referenced **Bangkok (`asia-southeast3`)** while showing the machine rows. The fully rendered pricing page itself was unstable in this browser session, so I am labeling these rows **best-effort**, not fully locked-down extracts. Google’s main pricing page confirms that Compute Engine prices are listed in **USD** and that **each vCPU and each GB of memory is billed separately**. citeturn16view0turn22search0turn27search0

| Provider | Family focus | Instance | vCPU | RAM | Price | Normalized cost per vCPU | Normalized cost per GB RAM |
|---|---|---:|---:|---:|---:|---:|---:|
| Google Cloud | General-purpose | N2 standard `n2-standard-4` | 4 | 16 GiB | **$0.194236/hour** | **$0.04856/vCPU-hour** | **$0.01214/GB-hour** |
| Google Cloud | Compute-optimized | C2 standard `c2-standard-4` | 4 | 16 GiB | **$0.208808/hour** | **$0.05220/vCPU-hour** | **$0.01305/GB-hour** |

I was **not able to extract a memory-optimized Bangkok machine row from Google’s official page with the same confidence** during this session, despite confirming that memory-optimized families are part of the official Compute Engine pricing structure. citeturn16view0turn19view2

## Discounts, commitments, and custom configuration nuances

Google Cloud is the clearest of the six providers on **custom machine pricing mechanics** in the sources captured here. Its official Compute Engine pricing documentation states that **each vCPU and each GB of memory is billed separately**, and it explicitly points users to the Google Cloud Pricing Calculator for custom machine estimates. Google also exposes **resource-based CUDs** and **flexible spend-based CUDs**, with the documentation stating up to **70%** off on memory-optimized machine types and up to **55%** off on other machine types for 3-year resource-based commitments, plus **28%** off for 1-year flexible commitments and **46%** off for 3-year flexible commitments; it also documents automatic **sustained-use discounts up to 30%**. These discount rules are described as applying across regions or across eligible regional usage, which matters for Bangkok because it means Thailand-region usage can participate in the same commitment mechanics even when the page does not give me a neatly exported Bangkok-only row. citeturn16view0turn18view0

Tencent Cloud’s official calculator/search results show both **pay-as-you-go** and **subscription** pricing modes, and the pricing calculator search snippet exposes a subscription ladder including **1 month**, **6 months**, **1 year**, **2 years**, **3 years**, **4 years**, and **5 years**, with headline discount factors shown on the pricing page. Tencent’s documentation also exposes an official **Reserved Instances** API and separate **Spot** pricing/discount documentation. In the Bangkok calculator rows I captured, the subscription totals were shown in the same snippet as the hourly prices, but the calculator’s dynamically rendered layout did not expose full headers cleanly enough for me to attribute every numeric column with full certainty, so I use the Bangkok hourly numbers for normalization and treat the longer-term Tencent contract values as evidence that **Bangkok subscriptions exist and materially reduce cost**, not as a perfectly parsed full discount schedule by term. citeturn68search0turn50search12turn50search0turn66search0turn62search0turn65search0

For AWS, Azure, Alibaba Cloud, and Huawei Cloud, I confirmed the **official pricing entry points** but did not get a stable, citable Bangkok machine-row export from the official interfaces during this session. In practice, that means I can say the following with confidence:

AWS exposes regional EC2 price lists through its official **regional Price List API**. citeturn9view0  
Azure exposes official VM pricing through both the **Azure VM pricing page** and the **Azure Retail Prices API**, and Microsoft’s docs say the API is the official unauthenticated programmatic way to retrieve retail rates, with **USD as the base pricing currency**. citeturn41view0turn38search1  
Alibaba Cloud exposes an official ECS pricing list with **Thailand (Bangkok)** as a supported regional selector. citeturn79search1  
Huawei Cloud exposes an official pricing calculator that includes **AP-Bangkok**. citeturn75search0turn50search3

I did **not** verify Bangkok-region **per-vCPU/per-GB custom pricing** for AWS, Azure, Alibaba Cloud, Tencent Cloud, or Huawei Cloud from the captured official sources. The only provider for which I could verify that level of custom billing structure directly in this session was **Google Cloud**. citeturn16view0

## Price competitiveness in Thailand

On the subset of prices I could verify directly and normalize, **Tencent Cloud looks materially more CPU-competitive than Google Cloud in Bangkok**. Using the representative rows above, Tencent’s normalized CPU cost ranges from roughly **$0.02625 to $0.02750 per vCPU-hour** for the S5 and C5 rows, while Google’s Bangkok-linked general-purpose and compute rows sit at about **$0.04856** and **$0.05220 per vCPU-hour**. That implies Tencent’s verified Bangkok sample is roughly **46% to 47% cheaper per vCPU-hour** than the comparable Google rows I could extract. citeturn66search0turn62search0turn22search0turn27search0

For memory economics, the picture is more nuanced. Tencent’s **memory-optimized MA5.2XLARGE64** normalizes to about **$0.00531 per GB-hour**, which is strong on raw RAM economics. Google’s **N2** and **C2** samples normalize to about **$0.01214** and **$0.01305 per GB-hour** respectively, but those are **general-purpose** and **compute-optimized** rows, not Google memory-optimized rows, so I would not present that as a full memory-optimized head-to-head. What I can say is that Tencent’s Bangkok memory-optimized sample looks inexpensive on a RAM-normalized basis, whereas I could not verify rival Bangkok memory-optimized rows strongly enough from the other vendors’ official sources in-session to produce a fair full-market ranking. citeturn65search0turn22search0turn27search0

The most defendable summary is therefore:

- **Best verified CPU economics in Bangkok from the sources captured here:** **Tencent Cloud**, especially if the AMD **SA5** line is acceptable for the workload. citeturn58search0turn66search0
- **Best verified RAM-heavy normalized value from the sources captured here:** **Tencent Cloud MA5**. citeturn65search0
- **Most transparent official custom-VM pricing model in this research set:** **Google Cloud**, because the pricing docs explicitly state separate billing for vCPU and memory and document the commitment menu in detail. citeturn16view0

## Bottom line and limitations

The strongest high-confidence conclusion is that **Tencent Cloud is the most price-competitive provider in Thailand among the official Bangkok-region VM prices I could directly verify in this session**, especially on **CPU-normalized** cost and likely also on **memory-normalized** cost for memory-heavy shapes. Google Cloud is the best-documented option for **custom VM billing** and discount structure, but on the specific Bangkok-linked sample rows I could extract, it was notably more expensive per vCPU-hour than Tencent. citeturn58search0turn66search0turn62search0turn65search0turn16view0turn22search0turn27search0

I would **not** claim a complete six-way winner across AWS, Google Cloud, Azure, Alibaba Cloud, Tencent Cloud, and Huawei Cloud from this session alone, because I could not capture enough citable Bangkok-selected machine rows from the official AWS, Azure, Alibaba, and Huawei interfaces to support a rigorous final numeric league table without overstating certainty. The safest synthesis is: **Tencent Cloud leads the verified Bangkok sample set on price, Google Cloud is the cleanest on custom-vCPU/custom-memory billing, and the other four providers still need a direct calculator/API pull from their official interfaces to complete a fully comprehensive Thailand-region benchmark.** citeturn9view0turn38search1turn79search1turn75search0turn53view0turn16view0

## Open questions and limitations

The remaining gaps are concentrated in **official Bangkok-row extraction**, not in region identification. AWS, Azure, Alibaba Cloud, and Huawei Cloud all had official pricing entry points, but their dynamic calculators or API-style pages did not expose stable Bangkok-selected machine rows cleanly enough in this browser session for the same level of numeric confidence I achieved with Tencent and, partially, Google. Alibaba’s official ECS pricing page clearly lists **Thailand (Bangkok)** as a selectable region, but the search snippet that exposed instance pricing was still anchored to **China (Hong Kong)**, so I excluded Alibaba’s machine prices from the final normalized ranking rather than risk mislabeling them as Bangkok prices. Google’s Bangkok-linked prices are included as **best-effort official extracts**, not as a full canonical export. citeturn79search1turn80search0turn22search0turn27search0