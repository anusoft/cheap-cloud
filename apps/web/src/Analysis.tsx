import { useEffect, useMemo, useState } from "react";
import type { InstancePrice, ProviderId, Snapshot } from "@cheap-cloud/schema";
import { loadSnapshot } from "./lib/data";
import { PROVIDER_COLORS, PROVIDER_LABELS } from "./lib/view";

type Lang = "en" | "th";

const usd = (n: number | null | undefined) =>
  n == null ? "—" : `$${Math.round(n)}`;

function commit(r: InstancePrice, term: "1yr" | "3yr"): number | null {
  const c = r.commitments.find((x) => x.term === term);
  return c ? c.effectiveHourlyUSD * 730 : null;
}

// Cheapest general/compute instance at an exact vCPU count + RAM window, per provider.
function bench(rows: InstancePrice[], vcpu: number, ramMin: number, ramMax: number) {
  const out = new Map<ProviderId, InstancePrice>();
  for (const r of rows) {
    if (r.family !== "general" && r.family !== "compute") continue;
    if (r.vcpu !== vcpu || r.ramGiB < ramMin || r.ramGiB > ramMax) continue;
    if (!(r.monthlyUSD && r.monthlyUSD > 0)) continue;
    const cur = out.get(r.provider);
    if (!cur || r.monthlyUSD < cur.monthlyUSD!) out.set(r.provider, r);
  }
  return [...out.values()].sort((a, b) => a.monthlyUSD! - b.monthlyUSD!);
}

const T = {
  back: { en: "← Comparison table", th: "← ตารางเปรียบเทียบ" },
  title: {
    en: "Cloud Pricing in Thailand — Market Analysis",
    th: "การวิเคราะห์ราคาคลาวด์ในประเทศไทย",
  },
  subtitle: {
    en: "Live on-demand pricing for the Bangkok region across seven providers, including Hetzner via Singapore. All figures USD, Linux, on-demand unless noted.",
    th: "ราคาแบบ on-demand ล่าสุดสำหรับรีเจี้ยนกรุงเทพฯ จากผู้ให้บริการ 7 ราย รวมถึง Hetzner ผ่านสิงคโปร์ ตัวเลขทั้งหมดเป็น USD, Linux, on-demand เว้นแต่ระบุไว้",
  },
  overviewH: { en: "Overview", th: "ภาพรวม" },
  overview: {
    en: [
      "Thailand now has five hyperscale/regional clouds running generally-available regions inside the country — AWS, Google Cloud, Alibaba, Tencent and Huawei — all in Bangkok. Microsoft Azure has announced but not yet launched a Thai region, so its prices here use Singapore (Southeast Asia) as a proxy.",
      "For price-sensitive workloads that can tolerate ~15–25 ms of extra latency, Hetzner's Singapore location is included as a budget reference. The headline result: regional Chinese providers and Hetzner are dramatically cheaper on raw compute than the Western hyperscalers, while AWS/GCP/Azure lead on managed-service breadth and in-country data residency.",
    ],
    th: [
      "ปัจจุบันประเทศไทยมีคลาวด์ระดับ hyperscale/ภูมิภาคที่เปิดให้บริการจริง (GA) ภายในประเทศถึง 5 ราย ได้แก่ AWS, Google Cloud, Alibaba, Tencent และ Huawei ทั้งหมดอยู่ในกรุงเทพฯ ส่วน Microsoft Azure ประกาศแล้วแต่ยังไม่เปิดรีเจี้ยนในไทย จึงใช้ราคาจากสิงคโปร์ (Southeast Asia) เป็นตัวแทน",
      "สำหรับงานที่เน้นราคาและรับ latency เพิ่มราว 15–25 ms ได้ เรารวม Hetzner รีเจี้ยนสิงคโปร์ไว้เป็นตัวเลือกประหยัด ข้อสรุปหลักคือ ผู้ให้บริการจีนและ Hetzner ถูกกว่ามากในด้านราคาประมวลผลล้วน ๆ ขณะที่ AWS/GCP/Azure ได้เปรียบเรื่องบริการที่หลากหลายและการเก็บข้อมูลในประเทศ",
    ],
  },
  findingsH: { en: "Key findings", th: "ข้อค้นพบสำคัญ" },
  landscapeH: { en: "Provider landscape", th: "ผู้ให้บริการในไทย" },
  ga: { en: "GA in Thailand", th: "เปิดจริงในไทย" },
  proxy: { en: "Proxy (no Thai region)", th: "ตัวแทน (ไม่มีรีเจี้ยนไทย)" },
  benchPrefix: { en: "Benchmark — ", th: "เกณฑ์มาตรฐาน — " },
  benchSuffix: { en: " (cheapest per provider, monthly)", th: " (ถูกสุดต่อผู้ให้บริการ, ต่อเดือน)" },
  benchH: { en: "Benchmarks by size", th: "เปรียบเทียบตามขนาดเครื่อง" },
  benchNote: {
    en: "Cheapest general-purpose / compute instance at each size, per provider — on-demand monthly, then 1-year and 3-year committed. Blank = no matching shape offered.",
    th: "อินสแตนซ์แบบทั่วไป/คำนวณที่ถูกที่สุดในแต่ละขนาด ต่อผู้ให้บริการ — ราคา on-demand ต่อเดือน ตามด้วยสัญญา 1 ปีและ 3 ปี ช่องว่าง = ไม่มีรุ่นที่ตรงขนาด",
  },
  colProvider: { en: "Provider", th: "ผู้ให้บริการ" },
  colInstance: { en: "Instance", th: "อินสแตนซ์" },
  colMonthly: { en: "On-demand /mo", th: "ราคา/เดือน" },
  col1yr: { en: "1-yr /mo", th: "1 ปี /เดือน" },
  col3yr: { en: "3-yr /mo", th: "3 ปี /เดือน" },
  hetznerH: { en: "Hetzner Singapore — the budget option", th: "Hetzner สิงคโปร์ — ตัวเลือกประหยัด" },
  hetzner: {
    en: [
      "Hetzner has no Thai region; its nearest datacenter is Singapore (~2,300 km, roughly 15–25 ms extra round-trip to Bangkok). Only AMD shared (CPX) and dedicated (CCX) lines are sold there — the Intel CX and Arm CAX tiers are EU-only.",
      "On raw compute it is unbeatable here: the lowest $/vCPU-hour of any provider, and a 4 vCPU / 16 GB box for about a third of the hyperscaler price. The trade-offs are real, though: a proxy region (latency + data leaves Thailand), no committed-use discounts (on-demand only), and a thin managed-service ecosystem versus AWS/GCP/Azure.",
    ],
    th: [
      "Hetzner ไม่มีรีเจี้ยนในไทย ศูนย์ข้อมูลที่ใกล้ที่สุดคือสิงคโปร์ (~2,300 กม. เพิ่ม latency ราว 15–25 ms ถึงกรุงเทพฯ) และจำหน่ายเฉพาะ AMD แบบแชร์ (CPX) และแบบ dedicated (CCX) เท่านั้น ส่วนรุ่น Intel CX และ Arm CAX มีเฉพาะในยุโรป",
      "ด้านราคาประมวลผลล้วน ๆ ถือว่าเหนือชั้น คือ $/vCPU-ชม. ต่ำที่สุดในบรรดาผู้ให้บริการทั้งหมด และเครื่อง 4 vCPU / 16 GB ราคาเพียงราว 1 ใน 3 ของ hyperscaler แต่ก็มีข้อแลกเปลี่ยนจริง: เป็นรีเจี้ยนตัวแทน (latency สูงขึ้นและข้อมูลออกนอกไทย) ไม่มีส่วนลดสัญญาระยะยาว (มีแต่ on-demand) และบริการ managed น้อยกว่า AWS/GCP/Azure มาก",
    ],
  },
  commitH: { en: "Commitment savings", th: "ส่วนลดจากการผูกสัญญา" },
  commit: {
    en: [
      "If your utilization is steady, committed pricing changes the ranking. AWS Reserved and GCP/Azure 1-yr discounts land around 30–40%, and 3-yr around 50–55%. Alibaba and Tencent subscriptions go deeper — roughly 50% (1-yr) and 65% (3-yr). Hetzner has no commitment tier (on-demand only), so its advantage narrows as others commit.",
    ],
    th: [
      "หากการใช้งานคงที่ ราคาที่ผูกสัญญาจะเปลี่ยนอันดับ AWS Reserved และส่วนลด 1 ปีของ GCP/Azure อยู่ราว 30–40% และ 3 ปีราว 50–55% ส่วน Alibaba และ Tencent ลดลึกกว่า คือราว 50% (1 ปี) และ 65% (3 ปี) ขณะที่ Hetzner ไม่มีแบบผูกสัญญา (มีแต่ on-demand) ความได้เปรียบจึงแคบลงเมื่อรายอื่นผูกสัญญา",
    ],
  },
  recoH: { en: "Recommendations", th: "คำแนะนำ" },
  reco: {
    en: [
      "Need confirmed in-country data residency (PDPA) + managed services: AWS or Google Cloud Bangkok; baseline on Graviton/Arm or N4 for the best hyperscaler value.",
      "Lowest cost in-country, steady workloads: Tencent or Alibaba subscriptions in Bangkok — roughly half the hyperscaler monthly.",
      "Cheapest possible compute, latency-tolerant, no residency requirement: Hetzner Singapore CPX/CCX.",
      "Memory-heavy databases/caches: compare normalized $/GB-hour — Tencent's memory line and Hetzner CCX are strong.",
    ],
    th: [
      "ต้องเก็บข้อมูลในประเทศ (PDPA) และต้องการบริการ managed: เลือก AWS หรือ Google Cloud กรุงเทพฯ และใช้ Graviton/Arm หรือ N4 เพื่อความคุ้มค่าสูงสุด",
      "ต้นทุนต่ำสุดในประเทศ งานใช้งานคงที่: ใช้แบบ subscription ของ Tencent หรือ Alibaba ในกรุงเทพฯ ราคาราวครึ่งหนึ่งของ hyperscaler ต่อเดือน",
      "ต้องการประมวลผลถูกที่สุด รับ latency ได้ ไม่ติดเรื่อง data residency: Hetzner สิงคโปร์ รุ่น CPX/CCX",
      "ฐานข้อมูล/แคชที่ใช้หน่วยความจำมาก: เทียบ $/GB-ชม. แบบ normalize — รุ่น memory ของ Tencent และ CCX ของ Hetzner โดดเด่น",
    ],
  },
  methodH: { en: "Methodology & caveats", th: "ระเบียบวิธีและข้อจำกัด" },
  method: {
    en: [
      "Prices are pulled live from each provider's official API (AWS Price List, GCP Billing Catalog, Azure Retail Prices, Alibaba/Tencent/Huawei region APIs, Hetzner Cloud API) and normalized to USD/Linux/on-demand. Hetzner EUR is converted at the live ECB rate.",
      "Azure and Hetzner rows are flagged proxy because neither has a GA Thailand region. Per-vCPU/per-GB figures for fixed-shape providers are least-squares estimates. Excludes storage, egress, OS licensing and tax. Verify in each provider's console before purchase.",
    ],
    th: [
      "ราคาดึงสดจาก API ทางการของแต่ละผู้ให้บริการ (AWS Price List, GCP Billing Catalog, Azure Retail Prices, API รีเจี้ยนของ Alibaba/Tencent/Huawei และ Hetzner Cloud API) แล้ว normalize เป็น USD/Linux/on-demand ส่วนราคา EUR ของ Hetzner แปลงด้วยอัตรา ECB ล่าสุด",
      "แถวของ Azure และ Hetzner ถูกระบุว่าเป็นตัวแทน เพราะไม่มีรีเจี้ยน GA ในไทย ค่าต่อ vCPU/ต่อ GB ของผู้ให้บริการแบบรูปทรงคงที่เป็นค่าประมาณด้วยวิธีกำลังสองน้อยสุด ไม่รวมสตอเรจ ค่าโอนข้อมูลออก ค่าลิขสิทธิ์ OS และภาษี ควรตรวจสอบในคอนโซลของผู้ให้บริการก่อนซื้อจริง",
    ],
  },
};

const LANDSCAPE: { provider: ProviderId; region: string; ga: boolean }[] = [
  { provider: "aws", region: "ap-southeast-7", ga: true },
  { provider: "gcp", region: "asia-southeast3", ga: true },
  { provider: "alibaba", region: "ap-southeast-7", ga: true },
  { provider: "tencent", region: "ap-bangkok", ga: true },
  { provider: "huawei", region: "ap-southeast-2", ga: true },
  { provider: "azure", region: "southeastasia", ga: false },
  { provider: "hetzner", region: "sin", ga: false },
];

// vCPU/RAM configs to benchmark — small to large (8 GB → 128 GB). RAM windows
// allow for slight per-provider variation around the nominal size.
const BENCHMARKS = [
  { vcpu: 2, ramMin: 7, ramMax: 9, label: "2 vCPU / 8 GB" },
  { vcpu: 4, ramMin: 14, ramMax: 17, label: "4 vCPU / 16 GB" },
  { vcpu: 8, ramMin: 30, ramMax: 33, label: "8 vCPU / 32 GB" },
  { vcpu: 16, ramMin: 60, ramMax: 66, label: "16 vCPU / 64 GB" },
  { vcpu: 32, ramMin: 120, ramMax: 132, label: "32 vCPU / 128 GB" },
];

export function Analysis() {
  const [lang, setLang] = useState<Lang>("en");
  const [snap, setSnap] = useState<Snapshot | null>(null);
  useEffect(() => {
    loadSnapshot("bangkok").then(setSnap);
  }, []);
  const rows = (snap?.rows ?? []) as InstancePrice[];
  const benches = useMemo(
    () => BENCHMARKS.map((c) => ({ ...c, rows: bench(rows, c.vcpu, c.ramMin, c.ramMax) })),
    [rows],
  );
  const b2 = benches[0]?.rows ?? [];
  const b4 = benches[1]?.rows ?? [];
  const tr = <K extends keyof typeof T>(k: K) => T[k][lang] as string;

  const findings = useMemo(() => {
    const top2 = b2[0];
    const top4 = b4[0];
    const cheapVcpu = [...rows]
      .filter((r) => r.perVcpuHourUSD && r.perVcpuHourUSD > 0)
      .sort((a, b) => a.perVcpuHourUSD! - b.perVcpuHourUSD!)[0];
    if (lang === "th") {
      return [
        top4 && `ถูกสุดสำหรับ 4 vCPU / 16 GB ต่อเดือน: ${PROVIDER_LABELS[top4.provider]} ${top4.instanceName} ที่ ${usd(top4.monthlyUSD)}/เดือน`,
        cheapVcpu && `$/vCPU-ชม. ต่ำสุด: ${PROVIDER_LABELS[cheapVcpu.provider]} ${cheapVcpu.instanceName}`,
        "ผู้ให้บริการจีน (Tencent/Alibaba) และ Hetzner ถูกกว่า hyperscaler ตะวันตกราว 2–4 เท่าในราคา on-demand",
        "สัญญา 3 ปีของ Alibaba/Tencent ลดได้ลึกสุด (~65%)",
      ].filter(Boolean) as string[];
    }
    return [
      top4 && `Cheapest 4 vCPU / 16 GB per month: ${PROVIDER_LABELS[top4.provider]} ${top4.instanceName} at ${usd(top4.monthlyUSD)}/mo.`,
      top2 && `Cheapest 2 vCPU / 8 GB per month: ${PROVIDER_LABELS[top2.provider]} ${top2.instanceName} at ${usd(top2.monthlyUSD)}/mo.`,
      cheapVcpu && `Lowest normalized $/vCPU-hour: ${PROVIDER_LABELS[cheapVcpu.provider]} ${cheapVcpu.instanceName}.`,
      "Chinese providers (Tencent/Alibaba) and Hetzner run ~2–4× cheaper than the Western hyperscalers on on-demand compute; Alibaba/Tencent 3-yr commitments cut deepest (~65%).",
    ].filter(Boolean) as string[];
  }, [rows, b2, b4, lang]);

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

        <Section title={tr("landscapeH")}>
          <div className="landscape">
            {LANDSCAPE.map((l) => (
              <div key={l.provider} className="land-row">
                <span className="badge" style={{ background: PROVIDER_COLORS[l.provider] }}>
                  {PROVIDER_LABELS[l.provider]}
                </span>
                <span className="mono muted">{l.region}</span>
                <span className={l.ga ? "tag-ga" : "tag-proxy"}>
                  {l.ga ? tr("ga") : tr("proxy")}
                </span>
              </div>
            ))}
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

        <Section title={tr("commitH")}>
          {T.commit[lang].map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </Section>

        <Section title={tr("hetznerH")}>
          {T.hetzner[lang].map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </Section>

        <Section title={tr("recoH")}>
          <ul>
            {T.reco[lang].map((p, i) => (
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="analysis-section">
      <h2>{title}</h2>
      {children}
    </section>
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
          </tr>
        ))}
      </tbody>
    </table>
  );
}
