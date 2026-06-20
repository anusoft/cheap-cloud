import { useEffect, useMemo, useState } from "react";
import type { InstancePrice, ProviderId, Snapshot } from "@cheap-cloud/schema";
import { loadSnapshot } from "./lib/data";
import { hetznerPriceChanges, type HetznerPriceChange } from "./lib/analysis-history";
import {
  PROVIDER_COLORS,
  PROVIDER_LABELS,
  ratesFromSnapshot,
  includedStorageGiB,
  storageMonthlyUSD,
  type RateLookup,
  type Workload,
} from "./lib/view";

type Lang = "en" | "th";

const usd = (n: number | null | undefined) => (n == null ? "—" : `$${Math.round(n)}`);
const usd2 = (n: number | null | undefined) => (n == null ? "—" : `$${n.toFixed(2)}`);
const signedUsd2 = (n: number | null | undefined) =>
  n == null ? "—" : `${n >= 0 ? "+" : "-"}$${Math.abs(n).toFixed(2)}`;
const pct = (n: number | null | undefined) => (n == null ? "—" : `${Math.round(n * 100)}%`);
const signedPct = (n: number | null | undefined) =>
  n == null ? "—" : `${n >= 0 ? "+" : "-"}${Math.abs(n * 100).toFixed(1)}%`;
const L = (lang: Lang, en: string, th: string) => (lang === "en" ? en : th);

// "Match Hetzner" sizing: price the disk a comparable Hetzner box bundles.
const MATCH: Workload = { storageGiB: null, egressGiB: null, matchHetzner: true };
const HETZNER_PREVIOUS_KEY = "bangkok-2026-06-06";

function commit(r: InstancePrice, term: "1yr" | "3yr"): number | null {
  const c = r.commitments.find((x) => x.term === term);
  return c ? c.effectiveHourlyUSD * 730 : null;
}

// Cheapest instance at an exact vCPU count + RAM window, per provider. Covers
// general/compute/memory families so both balanced and RAM-heavy shapes appear.
function bench(rows: InstancePrice[], vcpu: number, ramMin: number, ramMax: number) {
  const out = new Map<ProviderId, InstancePrice>();
  for (const r of rows) {
    if (!["general", "compute", "memory"].includes(r.family)) continue;
    if (r.vcpu !== vcpu || r.ramGiB < ramMin || r.ramGiB > ramMax) continue;
    if (!(r.monthlyUSD && r.monthlyUSD > 0)) continue;
    const cur = out.get(r.provider);
    if (!cur || r.monthlyUSD < cur.monthlyUSD!) out.set(r.provider, r);
  }
  return [...out.values()].sort((a, b) => a.monthlyUSD! - b.monthlyUSD!);
}

const HYPERSCALERS: ProviderId[] = ["aws", "gcp", "azure"];

// Everything quantitative the page asserts is derived here from the rows.
interface ProvStat {
  provider: ProviderId;
  count: number;
  minVcpuHr: number | null;
  best1yr: number | null;
  best3yr: number | null;
  bundledGiB: number;
  bundledFree: boolean;
  storageRate: number | null;
  storageClass: string;
}

function computeFacts(rows: InstancePrice[], rateFor: RateLookup) {
  const provs = [...new Set(rows.map((r) => r.provider))];
  const perProv: ProvStat[] = provs.map((p) => {
    const rs = rows.filter((r) => r.provider === p);
    const vh = rs.map((r) => r.perVcpuHourUSD).filter((x): x is number => x != null && x > 0);
    const disc = (term: "1yr" | "3yr") => {
      const ds = rs.flatMap((r) =>
        r.commitments.filter((c) => c.term === term).map((c) => c.discountPct),
      );
      return ds.length ? Math.max(...ds) : null;
    };
    const rate = rateFor(p);
    return {
      provider: p,
      count: rs.length,
      minVcpuHr: vh.length ? Math.min(...vh) : null,
      best1yr: disc("1yr"),
      best3yr: disc("3yr"),
      bundledGiB: rate.bundledStorageGiB ?? 0,
      bundledFree: rate.bundledStorageFree ?? false,
      storageRate: rate.storagePerGbMonthUSD,
      storageClass: rate.storageClass,
    };
  });

  const byVcpu = perProv.filter((x) => x.minVcpuHr != null).sort((a, b) => a.minVcpuHr! - b.minVcpuHr!);
  const by1 = perProv.filter((x) => x.best1yr != null).sort((a, b) => b.best1yr! - a.best1yr!);
  const by3 = perProv.filter((x) => x.best3yr != null).sort((a, b) => b.best3yr! - a.best3yr!);
  const noCommit = perProv.filter((x) => x.best1yr == null && x.best3yr == null).map((x) => x.provider);

  const b416 = bench(rows, 4, 14, 17); // ascending by monthly
  const cheap416 = b416[0] ?? null;
  const exp416 = b416.length ? b416[b416.length - 1] : null;
  const spread =
    cheap416?.monthlyUSD && exp416?.monthlyUSD ? exp416.monthlyUSD / cheap416.monthlyUSD : null;
  const cheapHyper =
    b416.filter((r) => HYPERSCALERS.includes(r.provider)).sort((a, b) => a.monthlyUSD! - b.monthlyUSD!)[0] ??
    null;
  const hz416 = b416.find((r) => r.provider === "hetzner") ?? null;
  const hzRatio =
    hz416?.monthlyUSD && cheapHyper?.monthlyUSD ? hz416.monthlyUSD / cheapHyper.monthlyUSD : null;

  const cloud = perProv.filter((x) => !x.bundledFree);
  const cloudRates = cloud.map((x) => x.storageRate).filter((x): x is number => x != null);
  const cloudDisks = cloud.map((x) => x.bundledGiB).filter((x) => x > 0);
  const freeProvs = perProv.filter((x) => x.bundledFree).map((x) => x.provider);

  const hzLines = [
    ...new Set(rows.filter((r) => r.provider === "hetzner").map((r) => r.instanceName.replace(/\d.*/, ""))),
  ].sort();

  return {
    perProv: perProv.sort((a, b) => (a.minVcpuHr ?? 9) - (b.minVcpuHr ?? 9)),
    cheapestVcpu: byVcpu[0] ?? null,
    best1: by1[0] ?? null,
    best3: by3[0] ?? null,
    noCommit,
    b416,
    cheap416,
    exp416,
    spread,
    cheapHyper,
    hz416,
    hzRatio,
    cloudRateMin: cloudRates.length ? Math.min(...cloudRates) : null,
    cloudRateMax: cloudRates.length ? Math.max(...cloudRates) : null,
    cloudDiskMin: cloudDisks.length ? Math.min(...cloudDisks) : null,
    cloudDiskMax: cloudDisks.length ? Math.max(...cloudDisks) : null,
    freeProvs,
    hzLines,
  };
}
type Facts = ReturnType<typeof computeFacts>;

const T = {
  back: { en: "← Comparison table", th: "← ตารางเปรียบเทียบ" },
  title: {
    en: "Cloud Pricing in Thailand — Market Analysis",
    th: "การวิเคราะห์ราคาคลาวด์ในประเทศไทย",
  },
  subtitle: {
    en: "Every figure below is computed live from the Bangkok pricing table — on-demand, USD, Linux unless noted. Nothing here is hand-entered.",
    th: "ตัวเลขทุกค่าด้านล่างคำนวณสดจากตารางราคากรุงเทพฯ — on-demand, USD, Linux เว้นแต่ระบุไว้ ไม่มีค่าที่กรอกด้วยมือ",
  },
  overviewH: { en: "Overview", th: "ภาพรวม" },
  overview: {
    en: [
      "Thailand has five clouds running generally-available regions inside the country — AWS, Google Cloud, Alibaba, Tencent and Huawei, all in Bangkok. Microsoft Azure has announced but not yet launched a Thai region, so its prices use Singapore (Southeast Asia) as a proxy.",
      "Hetzner has no Thai region either; its nearest datacenter is Singapore (~15–25 ms extra to Bangkok), included as a budget reference. The numbers that follow come straight from the live table.",
    ],
    th: [
      "ประเทศไทยมีคลาวด์ที่เปิดให้บริการจริง (GA) ในประเทศ 5 ราย ได้แก่ AWS, Google Cloud, Alibaba, Tencent และ Huawei ทั้งหมดในกรุงเทพฯ ส่วน Microsoft Azure ประกาศแล้วแต่ยังไม่เปิดรีเจี้ยนไทย จึงใช้สิงคโปร์ (Southeast Asia) เป็นตัวแทน",
      "Hetzner ก็ไม่มีรีเจี้ยนไทย ศูนย์ข้อมูลใกล้สุดคือสิงคโปร์ (เพิ่ม ~15–25 ms ถึงกรุงเทพฯ) รวมไว้เป็นตัวเลือกประหยัด ตัวเลขถัดจากนี้มาจากตารางสดทั้งหมด",
    ],
  },
  findingsH: { en: "Key findings (from the table)", th: "ข้อค้นพบสำคัญ (จากตาราง)" },
  summaryH: { en: "Provider summary", th: "สรุปต่อผู้ให้บริการ" },
  summaryNote: {
    en: "Per provider, computed from the current snapshot: instance count, lowest normalized $/vCPU-hour, best 1-yr and 3-yr committed discount, bundled system disk and block-storage rate.",
    th: "ต่อผู้ให้บริการ คำนวณจากสแนปช็อตปัจจุบัน: จำนวนอินสแตนซ์, $/vCPU-ชม. ต่ำสุด, ส่วนลดสัญญา 1 ปีและ 3 ปีที่ดีสุด, ดิสก์ระบบที่แถม และค่าบล็อกสตอเรจ",
  },
  landscapeH: { en: "Provider landscape", th: "ผู้ให้บริการในไทย" },
  ga: { en: "GA in Thailand", th: "เปิดจริงในไทย" },
  proxy: { en: "Proxy (no Thai region)", th: "ตัวแทน (ไม่มีรีเจี้ยนไทย)" },
  benchPrefix: { en: "Benchmark — ", th: "เกณฑ์มาตรฐาน — " },
  benchSuffix: { en: " (cheapest per provider, monthly)", th: " (ถูกสุดต่อผู้ให้บริการ, ต่อเดือน)" },
  benchH: { en: "General-purpose benchmarks by size", th: "เปรียบเทียบเครื่องทั่วไปตามขนาด" },
  benchNote: {
    en: "Cheapest balanced (≈4 GB/vCPU) instance at each size, per provider — on-demand monthly, then 1-year and 3-year committed. Blank = no matching shape in the table.",
    th: "อินสแตนซ์แบบสมดุล (~4 GB/vCPU) ที่ถูกที่สุดในแต่ละขนาด ต่อผู้ให้บริการ — on-demand ต่อเดือน ตามด้วย 1 ปีและ 3 ปี ช่องว่าง = ไม่มีรุ่นที่ตรงในตาราง",
  },
  memH: { en: "Memory-optimized benchmarks (databases & caches)", th: "เปรียบเทียบเครื่องหน่วยความจำสูง (ฐานข้อมูลและแคช)" },
  memNote: {
    en: "Cheapest RAM-heavy shape (≈8 GB/vCPU) per provider — the relevant comparison for in-memory databases and analytics. Watch the $/GB column.",
    th: "รุ่นที่เน้นหน่วยความจำสูง (~8 GB/vCPU) ที่ถูกที่สุดต่อผู้ให้บริการ — เหมาะกับฐานข้อมูลในหน่วยความจำและงานวิเคราะห์ ดูคอลัมน์ $/GB",
  },
  colProvider: { en: "Provider", th: "ผู้ให้บริการ" },
  colInstance: { en: "Instance", th: "อินสแตนซ์" },
  colMonthly: { en: "On-demand /mo", th: "ราคา/เดือน" },
  col1yr: { en: "1-yr /mo", th: "1 ปี /เดือน" },
  col3yr: { en: "3-yr /mo", th: "3 ปี /เดือน" },
  colGb: { en: "$/GB·mo", th: "$/GB·เดือน" },
  storageH: { en: "Storage — bundled disk & cost to match Hetzner", th: "สตอเรจ — ดิสก์ที่แถม และต้นทุนเทียบเท่า Hetzner" },
  colInstances: { en: "Instances", th: "อินสแตนซ์" },
  colVcpuHr: { en: "Min $/vCPU-hr", th: "$/vCPU-ชม. ต่ำสุด" },
  colBundled: { en: "Bundled disk", th: "ดิสก์ที่แถม" },
  colRate: { en: "$/GB-mo", th: "$/GB-เดือน" },
  colMatch: { en: "Match Hetzner @ 4c/16g", th: "เทียบเท่า Hetzner @ 4c/16g" },
  commitH: { en: "Commitment savings", th: "ส่วนลดจากการผูกสัญญา" },
  hetznerH: { en: "Hetzner Singapore — the budget option", th: "Hetzner สิงคโปร์ — ตัวเลือกประหยัด" },
  hetznerChangeH: { en: "Hetzner price change — more expensive after refresh", th: "ราคา Hetzner เปลี่ยน — แพงขึ้นหลังรีเฟรช" },
  hetznerChangeNote: {
    en: "Compared with the previous Bangkok snapshot. Matching server types only, sorted by largest monthly increase.",
    th: "เทียบกับสแนปช็อตกรุงเทพฯ ก่อนหน้า เฉพาะรุ่นที่มีทั้งสองสแนปช็อต เรียงตามส่วนต่างรายเดือนที่เพิ่มขึ้นมากสุด",
  },
  colShape: { en: "Shape", th: "สเปก" },
  colOld: { en: "Old /mo", th: "เดิม /เดือน" },
  colNow: { en: "Now /mo", th: "ตอนนี้ /เดือน" },
  colChange: { en: "Change", th: "ส่วนต่าง" },
  recoH: { en: "Recommendations", th: "คำแนะนำ" },
  methodH: { en: "Methodology & caveats", th: "ระเบียบวิธีและข้อจำกัด" },
  method: {
    en: [
      "Prices are pulled from each provider's official API (AWS Price List, GCP Billing Catalog, Azure Retail Prices, Alibaba/Tencent/Huawei region APIs, Hetzner Cloud API), normalized to USD/Linux/on-demand; Hetzner EUR uses the live ECB rate. Per-vCPU/$-per-GB figures for fixed-shape providers are least-squares estimates.",
      "Storage figures come from the table's per-provider rates: every VM needs a boot disk, and the bundled-disk column above is each provider's own system disk (only Hetzner includes it free — its local NVMe, sized per shape and read live from the Hetzner API; Tencent's is read live from DescribeDiskConfigQuota; AWS gp3 $/GB is live; the rest are published list prices). 'Match Hetzner' prices the disk a comparable Hetzner box bundles. Bandwidth/egress is excluded from totals. Excludes OS licensing and tax. Azure & Hetzner are proxy regions. Verify in each provider's console before purchase.",
    ],
    th: [
      "ราคาดึงจาก API ทางการของแต่ละผู้ให้บริการ (AWS Price List, GCP Billing Catalog, Azure Retail Prices, API ของ Alibaba/Tencent/Huawei และ Hetzner Cloud API) normalize เป็น USD/Linux/on-demand ราคา EUR ของ Hetzner ใช้อัตรา ECB สด ค่า $/vCPU และ $/GB ของผู้ให้บริการรูปทรงคงที่เป็นค่าประมาณกำลังสองน้อยสุด",
      "ตัวเลขสตอเรจมาจากค่าต่อผู้ให้บริการในตาราง ทุก VM ต้องมีดิสก์บูต คอลัมน์ดิสก์ที่แถมด้านบนคือดิสก์ระบบของแต่ละเจ้า (มีเพียง Hetzner ที่ฟรี — NVMe ในเครื่อง ตามขนาดแต่ละรุ่น อ่านสดจาก Hetzner API; ของ Tencent อ่านสดจาก DescribeDiskConfigQuota; AWS gp3 $/GB เป็นค่าสด ที่เหลือเป็นราคาประกาศ) 'Match Hetzner' คิดค่าดิสก์เท่าที่เครื่อง Hetzner ขนาดใกล้กันแถม ไม่รวม bandwidth/egress ในยอดรวม ไม่รวมค่าลิขสิทธิ์ OS และภาษี Azure และ Hetzner เป็นรีเจี้ยนตัวแทน ตรวจสอบในคอนโซลก่อนซื้อจริง",
    ],
  },
};

const GA_BY_PROVIDER: Record<ProviderId, { region: string; ga: boolean }> = {
  aws: { region: "ap-southeast-7", ga: true },
  gcp: { region: "asia-southeast3", ga: true },
  alibaba: { region: "ap-southeast-7", ga: true },
  tencent: { region: "ap-bangkok", ga: true },
  huawei: { region: "ap-southeast-2", ga: true },
  azure: { region: "southeastasia", ga: false },
  hetzner: { region: "sin", ga: false },
};

const BENCHMARKS = [
  { vcpu: 2, ramMin: 7, ramMax: 9, label: "2 vCPU / 8 GB" },
  { vcpu: 4, ramMin: 14, ramMax: 17, label: "4 vCPU / 16 GB" },
  { vcpu: 8, ramMin: 30, ramMax: 33, label: "8 vCPU / 32 GB" },
  { vcpu: 16, ramMin: 60, ramMax: 66, label: "16 vCPU / 64 GB" },
  { vcpu: 32, ramMin: 120, ramMax: 132, label: "32 vCPU / 128 GB" },
];
const MEMORY_BENCHMARKS = [
  { vcpu: 2, ramMin: 15, ramMax: 17, label: "2 vCPU / 16 GB" },
  { vcpu: 4, ramMin: 30, ramMax: 34, label: "4 vCPU / 32 GB" },
  { vcpu: 8, ramMin: 60, ramMax: 68, label: "8 vCPU / 64 GB" },
  { vcpu: 16, ramMin: 120, ramMax: 136, label: "16 vCPU / 128 GB" },
];

const prov = (p: ProviderId | undefined) => (p ? PROVIDER_LABELS[p] : "—");

function findingsList(lang: Lang, f: Facts): string[] {
  const out: string[] = [];
  if (f.cheap416?.monthlyUSD != null)
    out.push(
      L(
        lang,
        `Cheapest 4 vCPU / 16 GB: ${prov(f.cheap416.provider)} ${f.cheap416.instanceName} at ${usd(f.cheap416.monthlyUSD)}/mo.`,
        `ถูกสุด 4 vCPU / 16 GB: ${prov(f.cheap416.provider)} ${f.cheap416.instanceName} ที่ ${usd(f.cheap416.monthlyUSD)}/เดือน`,
      ),
    );
  if (f.spread != null && f.cheap416 && f.exp416)
    out.push(
      L(
        lang,
        `Same 4 vCPU / 16 GB ranges ${usd(f.cheap416.monthlyUSD)}–${usd(f.exp416.monthlyUSD)}/mo across providers — a ${f.spread.toFixed(1)}× spread (priciest: ${prov(f.exp416.provider)}).`,
        `4 vCPU / 16 GB เดียวกันอยู่ที่ ${usd(f.cheap416.monthlyUSD)}–${usd(f.exp416.monthlyUSD)}/เดือน — ห่างกัน ${f.spread.toFixed(1)} เท่า (แพงสุด: ${prov(f.exp416.provider)})`,
      ),
    );
  if (f.cheapestVcpu?.minVcpuHr != null)
    out.push(
      L(
        lang,
        `Lowest normalized compute: ${prov(f.cheapestVcpu.provider)} at $${f.cheapestVcpu.minVcpuHr.toFixed(4)}/vCPU-hour.`,
        `ประมวลผลต่อหน่วยถูกสุด: ${prov(f.cheapestVcpu.provider)} ที่ $${f.cheapestVcpu.minVcpuHr.toFixed(4)}/vCPU-ชม.`,
      ),
    );
  if (f.best3)
    out.push(
      L(
        lang,
        `Deepest commitment discount: ${prov(f.best3.provider)} 3-yr (−${pct(f.best3.best3yr)})${f.best1 ? `; best 1-yr ${prov(f.best1.provider)} (−${pct(f.best1.best1yr)})` : ""}.`,
        `ส่วนลดสัญญาลึกสุด: ${prov(f.best3.provider)} 3 ปี (−${pct(f.best3.best3yr)})${f.best1 ? `; 1 ปีดีสุด ${prov(f.best1.provider)} (−${pct(f.best1.best1yr)})` : ""}`,
      ),
    );
  if (f.freeProvs.length && f.cloudDiskMin != null)
    out.push(
      L(
        lang,
        `Storage: only ${f.freeProvs.map(prov).join("/")} bundles disk free; cloud system disks are ${f.cloudDiskMin}–${f.cloudDiskMax} GB billed at ${usd2(f.cloudRateMin)}–${usd2(f.cloudRateMax)}/GB-month.`,
        `สตอเรจ: มีเพียง ${f.freeProvs.map(prov).join("/")} ที่แถมดิสก์ฟรี ส่วนดิสก์ระบบของคลาวด์อยู่ที่ ${f.cloudDiskMin}–${f.cloudDiskMax} GB คิด ${usd2(f.cloudRateMin)}–${usd2(f.cloudRateMax)}/GB-เดือน`,
      ),
    );
  return out;
}

export function Analysis() {
  const [lang, setLang] = useState<Lang>("en");
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [previousSnap, setPreviousSnap] = useState<Snapshot | null>(null);
  useEffect(() => {
    let cancelled = false;
    Promise.all([loadSnapshot("bangkok"), loadSnapshot(HETZNER_PREVIOUS_KEY)]).then(
      ([current, previous]) => {
        if (cancelled) return;
        setSnap(current);
        setPreviousSnap(previous);
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);
  const rows = (snap?.rows ?? []) as InstancePrice[];
  const previousRows = (previousSnap?.rows ?? []) as InstancePrice[];
  const rateFor = useMemo(() => ratesFromSnapshot(snap), [snap]);
  const facts = useMemo(() => computeFacts(rows, rateFor), [rows, rateFor]);
  const hzChanges = useMemo(
    () => hetznerPriceChanges(rows, previousRows),
    [rows, previousRows],
  );
  const benches = useMemo(
    () => BENCHMARKS.map((c) => ({ ...c, rows: bench(rows, c.vcpu, c.ramMin, c.ramMax) })),
    [rows],
  );
  const memBenches = useMemo(
    () => MEMORY_BENCHMARKS.map((c) => ({ ...c, rows: bench(rows, c.vcpu, c.ramMin, c.ramMax) })),
    [rows],
  );
  const tr = <K extends keyof typeof T>(k: K) => T[k][lang] as string;
  const findings = useMemo(() => findingsList(lang, facts), [lang, facts]);

  return (
    <div className="analysis">
      <header className="analysis-bar">
        <a className="nav-link" href="#/">
          {tr("back")}
        </a>
        <div className="lang-toggle">
          <button className={lang === "en" ? "on" : ""} onClick={() => setLang("en")}>
            EN
          </button>
          <button className={lang === "th" ? "on" : ""} onClick={() => setLang("th")}>
            ไทย
          </button>
        </div>
      </header>

      <article className="analysis-body">
        <h1>{tr("title")}</h1>
        <p className="lede">{tr("subtitle")}</p>
        {snap && (
          <p className="muted small">
            {rows.length} instances · {snap.providers.length} providers ·{" "}
            {new Date(snap.generatedAt).toLocaleDateString()}
          </p>
        )}

        <Section title={tr("overviewH")}>
          {T.overview[lang].map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </Section>

        <Section title={tr("findingsH")}>
          <ul>
            {findings.map((f, i) => (
              <li key={i}>{f}</li>
            ))}
          </ul>
        </Section>

        <Section title={tr("summaryH")}>
          <p className="muted small">{tr("summaryNote")}</p>
          <SummaryTable facts={facts} tr={tr} />
        </Section>

        <Section title={tr("landscapeH")}>
          <div className="landscape">
            {facts.perProv.map((s) => {
              const meta = GA_BY_PROVIDER[s.provider];
              return (
                <div key={s.provider} className="land-row">
                  <span className="badge" style={{ background: PROVIDER_COLORS[s.provider] }}>
                    {PROVIDER_LABELS[s.provider]}
                  </span>
                  <span className="mono muted">{meta.region}</span>
                  <span className={meta.ga ? "tag-ga" : "tag-proxy"}>
                    {meta.ga ? tr("ga") : tr("proxy")}
                  </span>
                </div>
              );
            })}
          </div>
        </Section>

        <Section title={tr("benchH")}>
          <p className="muted small">{tr("benchNote")}</p>
          {benches.map((bm) => (
            <div key={bm.label} className="bench-block">
              <h3>{tr("benchPrefix") + bm.label + tr("benchSuffix")}</h3>
              <BenchTable rows={bm.rows} tr={tr} />
            </div>
          ))}
        </Section>

        <Section title={tr("memH")}>
          <p className="muted small">{tr("memNote")}</p>
          {memBenches.map((bm) => (
            <div key={bm.label} className="bench-block">
              <h3>{tr("benchPrefix") + bm.label + tr("benchSuffix")}</h3>
              <BenchTable rows={bm.rows} tr={tr} />
            </div>
          ))}
        </Section>

        <Section title={tr("storageH")}>
          <StorageTable facts={facts} rateFor={rateFor} tr={tr} />
        </Section>

        <Section title={tr("commitH")}>
          <p>{commitNote(lang, facts)}</p>
        </Section>

        <Section title={tr("hetznerH")}>
          {hetznerNotes(lang, facts).map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </Section>

        <Section title={tr("hetznerChangeH")}>
          <p>{hetznerChangeNote(lang, hzChanges, snap, previousSnap)}</p>
          <p className="muted small">{tr("hetznerChangeNote")}</p>
          <HetznerChangeTable changes={hzChanges} tr={tr} />
        </Section>

        <Section title={tr("recoH")}>
          <ul>
            {recoList(lang, facts).map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        </Section>

        <Section title={tr("methodH")}>
          {T.method[lang].map((p, i) => (
            <p key={i} className="muted small">
              {p}
            </p>
          ))}
        </Section>

        <p className="analysis-foot">
          <a className="nav-link" href="#/">
            {tr("back")}
          </a>
        </p>
      </article>
    </div>
  );
}

function commitNote(lang: Lang, f: Facts): string {
  const none = f.noCommit.map(prov).join(", ");
  const onDemand = f.noCommit.length
    ? L(lang, ` ${none} offer no committed tier (on-demand only).`, ` ${none} ไม่มีแบบผูกสัญญา (on-demand เท่านั้น)`)
    : "";
  if (!f.best1 && !f.best3)
    return L(lang, "No committed pricing is present in the table." + onDemand, "ไม่มีราคาผูกสัญญาในตาราง" + onDemand);
  return L(
    lang,
    `Where offered, the deepest 1-year discount in the table is ${prov(f.best1?.provider)} (−${pct(f.best1?.best1yr)}) and the deepest 3-year is ${prov(f.best3?.provider)} (−${pct(f.best3?.best3yr)}). Committing flips the ranking for steady workloads.` + onDemand,
    `เท่าที่มี ส่วนลด 1 ปีลึกสุดในตารางคือ ${prov(f.best1?.provider)} (−${pct(f.best1?.best1yr)}) และ 3 ปีลึกสุดคือ ${prov(f.best3?.provider)} (−${pct(f.best3?.best3yr)}) การผูกสัญญาจะเปลี่ยนอันดับสำหรับงานที่ใช้คงที่` + onDemand,
  );
}

function hetznerNotes(lang: Lang, f: Facts): string[] {
  const out: string[] = [];
  out.push(
    L(
      lang,
      `Hetzner has no Thai region; its nearest datacenter is Singapore (~15–25 ms extra to Bangkok). The table shows its ${f.hzLines.join("/")} lines there.`,
      `Hetzner ไม่มีรีเจี้ยนไทย ศูนย์ข้อมูลใกล้สุดคือสิงคโปร์ (เพิ่ม ~15–25 ms ถึงกรุงเทพฯ) ในตารางมีรุ่น ${f.hzLines.join("/")}`,
    ),
  );
  if (f.hz416?.monthlyUSD != null && f.cheapHyper?.monthlyUSD != null && f.hzRatio != null) {
    out.push(
      L(
        lang,
        `Its cheapest 4 vCPU / 16 GB is ${usd(f.hz416.monthlyUSD)}/mo — about ${f.hzRatio.toFixed(2)}× the cheapest hyperscaler (${prov(f.cheapHyper.provider)} at ${usd(f.cheapHyper.monthlyUSD)}/mo)${f.cheapestVcpu?.provider === "hetzner" ? ", and it posts the lowest $/vCPU-hour in the table" : ""}. Trade-offs: proxy region, on-demand only (no commitments), and a thinner managed-service ecosystem.`,
        `เครื่อง 4 vCPU / 16 GB ที่ถูกสุดอยู่ที่ ${usd(f.hz416.monthlyUSD)}/เดือน — ราว ${f.hzRatio.toFixed(2)} เท่าของ hyperscaler ที่ถูกสุด (${prov(f.cheapHyper.provider)} ที่ ${usd(f.cheapHyper.monthlyUSD)}/เดือน)${f.cheapestVcpu?.provider === "hetzner" ? " และมี $/vCPU-ชม. ต่ำสุดในตาราง" : ""} ข้อแลกเปลี่ยน: รีเจี้ยนตัวแทน, on-demand เท่านั้น และบริการ managed น้อยกว่า`,
      ),
    );
  }
  return out;
}

function dateLabel(snap: Snapshot | null): string {
  return snap?.generatedAt ? snap.generatedAt.slice(0, 10) : "—";
}

function hetznerChangeNote(
  lang: Lang,
  changes: HetznerPriceChange[],
  current: Snapshot | null,
  previous: Snapshot | null,
): string {
  if (!previous)
    return L(
      lang,
      "Previous Hetzner pricing snapshot is not available in this build.",
      "บิลด์นี้ไม่มีสแนปช็อตราคา Hetzner ก่อนหน้า",
    );
  if (!changes.length)
    return L(
      lang,
      `No matching Hetzner server types were found between ${dateLabel(previous)} and ${dateLabel(current)}.`,
      `ไม่พบรุ่น Hetzner ที่ตรงกันระหว่าง ${dateLabel(previous)} และ ${dateLabel(current)}`,
    );

  const increased = changes.filter((c) => c.deltaUSD > 0);
  const decreased = changes.filter((c) => c.deltaUSD < 0);
  const biggest = increased[0] ?? changes[0]!;
  const cheaperText = decreased.length
    ? L(
        lang,
        ` ${decreased.length} smaller moves went down, mostly from FX and line-item reshuffling.`,
        ` มี ${decreased.length} รุ่นที่ลดลงเล็กน้อย ส่วนใหญ่จาก FX และการจัดรายการราคาใหม่`,
      )
    : "";

  if (!increased.length)
    return L(
      lang,
      `Compared with ${dateLabel(previous)}, none of the ${changes.length} matching Hetzner server types became more expensive.`,
      `เทียบกับ ${dateLabel(previous)} ไม่มีรุ่น Hetzner ที่ตรงกันทั้ง ${changes.length} รุ่นที่แพงขึ้น`,
    );

  return L(
    lang,
    `Compared with the old ${dateLabel(previous)} pricing, Hetzner is now more expensive on ${increased.length} of ${changes.length} matching server types. Biggest increase: ${biggest.instanceName} moved from ${usd2(biggest.oldMonthlyUSD)}/mo to ${usd2(biggest.currentMonthlyUSD)}/mo (${signedUsd2(biggest.deltaUSD)}, ${signedPct(biggest.deltaPct)}).${cheaperText}`,
    `เทียบกับราคาเดิม ${dateLabel(previous)} ตอนนี้ Hetzner แพงขึ้นใน ${increased.length} จาก ${changes.length} รุ่นที่ตรงกัน เพิ่มแรงสุดคือ ${biggest.instanceName} จาก ${usd2(biggest.oldMonthlyUSD)}/เดือน เป็น ${usd2(biggest.currentMonthlyUSD)}/เดือน (${signedUsd2(biggest.deltaUSD)}, ${signedPct(biggest.deltaPct)})${cheaperText}`,
  );
}

function recoList(lang: Lang, f: Facts): string[] {
  const cheapInCountry =
    f.b416.filter((r) => GA_BY_PROVIDER[r.provider].ga).sort((a, b) => a.monthlyUSD! - b.monthlyUSD!)[0] ?? null;
  const out: string[] = [];
  out.push(
    L(
      lang,
      "Confirmed in-country data residency (PDPA) + managed services: AWS or Google Cloud Bangkok.",
      "ต้องเก็บข้อมูลในประเทศ (PDPA) + บริการ managed: AWS หรือ Google Cloud กรุงเทพฯ",
    ),
  );
  if (cheapInCountry?.monthlyUSD != null)
    out.push(
      L(
        lang,
        `Lowest cost with a Thai region (4 vCPU / 16 GB): ${prov(cheapInCountry.provider)} ${cheapInCountry.instanceName} at ${usd(cheapInCountry.monthlyUSD)}/mo${f.best3 ? `, less ~${pct(f.best3.best3yr)} on a 3-yr commitment with ${prov(f.best3.provider)}` : ""}.`,
        `ต้นทุนต่ำสุดที่มีรีเจี้ยนไทย (4 vCPU / 16 GB): ${prov(cheapInCountry.provider)} ${cheapInCountry.instanceName} ที่ ${usd(cheapInCountry.monthlyUSD)}/เดือน${f.best3 ? ` ลดอีก ~${pct(f.best3.best3yr)} ด้วยสัญญา 3 ปีของ ${prov(f.best3.provider)}` : ""}`,
      ),
    );
  if (f.hz416?.monthlyUSD != null)
    out.push(
      L(
        lang,
        `Cheapest compute, latency-tolerant, no residency requirement: Hetzner Singapore (${usd(f.hz416.monthlyUSD)}/mo for 4 vCPU / 16 GB).`,
        `ประมวลผลถูกสุด รับ latency ได้ ไม่ติด residency: Hetzner สิงคโปร์ (${usd(f.hz416.monthlyUSD)}/เดือน สำหรับ 4 vCPU / 16 GB)`,
      ),
    );
  out.push(
    L(
      lang,
      "Storage-heavy: only Hetzner bundles disk free — on the clouds the boot/data disk is billed (see the storage table); turn on 'Match Hetzner' in the table to price an equivalent disk.",
      "งานที่ใช้ดิสก์มาก: มีเพียง Hetzner ที่แถมดิสก์ฟรี ฝั่งคลาวด์คิดเงินดิสก์ (ดูตารางสตอเรจ) เปิด 'Match Hetzner' ในตารางเพื่อคิดดิสก์เทียบเท่า",
    ),
  );
  return out;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="analysis-section">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function SummaryTable({ facts, tr }: { facts: Facts; tr: (k: keyof typeof T) => string }) {
  return (
    <table className="bench">
      <thead>
        <tr>
          <th>{tr("colProvider")}</th>
          <th>{tr("colInstances")}</th>
          <th>{tr("colVcpuHr")}</th>
          <th>{tr("col1yr")}</th>
          <th>{tr("col3yr")}</th>
          <th>{tr("colBundled")}</th>
          <th>{tr("colRate")}</th>
        </tr>
      </thead>
      <tbody>
        {facts.perProv.map((s) => (
          <tr key={s.provider}>
            <td>
              <span className="badge" style={{ background: PROVIDER_COLORS[s.provider] }}>
                {PROVIDER_LABELS[s.provider]}
              </span>
            </td>
            <td className="num">{s.count}</td>
            <td className="num strong">{s.minVcpuHr != null ? `$${s.minVcpuHr.toFixed(4)}` : "—"}</td>
            <td className="num">{s.best1yr != null ? `−${pct(s.best1yr)}` : "—"}</td>
            <td className="num">{s.best3yr != null ? `−${pct(s.best3yr)}` : "—"}</td>
            <td className="num">
              {s.bundledGiB} GB{" "}
              <span className={s.bundledFree ? "conf ok" : "muted"}>{s.bundledFree ? "free" : "billed"}</span>
            </td>
            <td className="num muted">{usd2(s.storageRate)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function StorageTable({
  facts,
  rateFor,
  tr,
}: {
  facts: Facts;
  rateFor: RateLookup;
  tr: (k: keyof typeof T) => string;
}) {
  // Cost to provision a comparable Hetzner-bundled disk for a 4 vCPU / 16 GB box.
  const matchRows = facts.b416;
  return (
    <table className="bench">
      <thead>
        <tr>
          <th>{tr("colProvider")}</th>
          <th>{tr("colBundled")}</th>
          <th>{tr("colRate")}</th>
          <th>{tr("colMatch")}</th>
        </tr>
      </thead>
      <tbody>
        {matchRows.map((r) => {
          const rate = rateFor(r.provider);
          const matchGiB = includedStorageGiB(r);
          const cost = storageMonthlyUSD(r, rate, MATCH);
          return (
            <tr key={r.id}>
              <td>
                <span className="badge" style={{ background: PROVIDER_COLORS[r.provider] }}>
                  {PROVIDER_LABELS[r.provider]}
                </span>
              </td>
              <td className="num">
                {rate.bundledStorageGiB ?? 0} GB{" "}
                <span className={rate.bundledStorageFree ? "conf ok" : "muted"}>
                  {rate.bundledStorageFree ? "free" : "billed"}
                </span>
              </td>
              <td className="num muted">{usd2(rate.storagePerGbMonthUSD)}</td>
              <td className="num strong">
                {matchGiB} GB → {cost > 0 ? usd2(cost) : <span className="conf ok">free</span>}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function HetznerChangeTable({
  changes,
  tr,
}: {
  changes: HetznerPriceChange[];
  tr: (k: keyof typeof T) => string;
}) {
  const rows = changes.filter((c) => c.deltaUSD > 0).slice(0, 8);
  if (rows.length === 0) return null;
  return (
    <table className="bench">
      <thead>
        <tr>
          <th>{tr("colInstance")}</th>
          <th>{tr("colShape")}</th>
          <th>{tr("colOld")}</th>
          <th>{tr("colNow")}</th>
          <th>{tr("colChange")}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.instanceName}>
            <td className="mono">{r.instanceName}</td>
            <td className="num muted">
              {r.vcpu}c / {r.ramGiB} GB
            </td>
            <td className="num">{usd2(r.oldMonthlyUSD)}</td>
            <td className="num strong">{usd2(r.currentMonthlyUSD)}</td>
            <td className="num">
              <span className="conf proxy">
                {signedUsd2(r.deltaUSD)} · {signedPct(r.deltaPct)}
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function BenchTable({
  rows,
  tr,
}: {
  rows: InstancePrice[];
  tr: (k: keyof typeof T) => string;
}) {
  if (rows.length === 0) return <p className="muted">—</p>;
  return (
    <table className="bench">
      <thead>
        <tr>
          <th>{tr("colProvider")}</th>
          <th>{tr("colInstance")}</th>
          <th>{tr("colMonthly")}</th>
          <th>{tr("col1yr")}</th>
          <th>{tr("col3yr")}</th>
          <th>{tr("colGb")}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id}>
            <td>
              <span className="badge" style={{ background: PROVIDER_COLORS[r.provider] }}>
                {PROVIDER_LABELS[r.provider]}
              </span>
              {r.source.confidence === "proxy" && <span className="conf proxy">proxy</span>}
            </td>
            <td className="mono">{r.instanceName}</td>
            <td className="num strong">{usd(r.monthlyUSD)}</td>
            <td className="num">{usd(commit(r, "1yr"))}</td>
            <td className="num">{usd(commit(r, "3yr"))}</td>
            <td className="num muted">
              {r.monthlyUSD && r.ramGiB ? `$${(r.monthlyUSD / r.ramGiB).toFixed(2)}` : "—"}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
