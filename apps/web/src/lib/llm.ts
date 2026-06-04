import type { InstancePrice } from "@cheap-cloud/schema";
import { PROVIDER_LABELS } from "./view";

// Browser-side LLM call to any OpenAI-compatible endpoint. Config comes from
// VITE_OPENAI_* env vars, baked at build time. On the static Pages build these
// are unset → llmConfigured() is false → the chat panel hides itself. Locally,
// set them in .env to enable the "Ask the data" panel.
const BASE_URL = (import.meta.env.VITE_OPENAI_BASE_URL ?? "").replace(/\/$/, "");
const API_KEY = import.meta.env.VITE_OPENAI_API_KEY ?? "";
const MODEL = import.meta.env.VITE_OPENAI_MODEL ?? "gpt-4o-mini";

export function llmConfigured(): boolean {
  return Boolean(BASE_URL && API_KEY);
}

function round(n: number | null | undefined): number | null {
  return n == null ? null : Math.round(n * 1e5) / 1e5;
}
function compact(r: InstancePrice) {
  const c1 = r.commitments.find((c) => c.term === "1yr");
  const c3 = r.commitments.find((c) => c.term === "3yr");
  return {
    provider: PROVIDER_LABELS[r.provider],
    instance: r.instanceName,
    region: r.regionCode,
    family: r.family,
    arch: r.arch,
    vcpu: r.vcpu,
    ramGiB: r.ramGiB,
    usd_hr: round(r.onDemandHourlyUSD),
    usd_mo: round(r.monthlyUSD),
    usd_vcpu_hr: round(r.perVcpuHourUSD),
    usd_gb_hr: round(r.perGbHourUSD),
    "1yr_hr": round(c1?.effectiveHourlyUSD ?? null),
    "3yr_hr": round(c3?.effectiveHourlyUSD ?? null),
    confidence: r.source.confidence,
  };
}

export async function askLLM(opts: {
  question: string;
  rows: InstancePrice[];
}): Promise<{ answer: string; error?: string }> {
  if (!llmConfigured()) {
    return { answer: "", error: "LLM not configured (set VITE_OPENAI_* in .env)." };
  }
  const rows = opts.rows.slice(0, 400).map(compact);
  const system =
    "You are a precise cloud-pricing analyst. Answer ONLY from the JSON dataset. " +
    "Prices are USD. Prefer normalized $/vCPU-hr or $/GB-hr for fair comparison, " +
    "state exact numbers with provider+instance, and note rows whose confidence is 'proxy'. " +
    "Be concise; small markdown tables are welcome.";
  const user = `Question: ${opts.question}\n\nDATASET (${rows.length} rows):\n${JSON.stringify(rows)}`;
  try {
    const res = await fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.2,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
    if (!res.ok) return { answer: "", error: `LLM ${res.status}: ${await res.text()}` };
    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    return { answer: json.choices?.[0]?.message?.content ?? "" };
  } catch (e) {
    return { answer: "", error: String(e) };
  }
}
