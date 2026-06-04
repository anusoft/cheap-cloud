import { useState } from "react";
import type { InstancePrice } from "@cheap-cloud/schema";
import { askLLM, llmConfigured } from "../lib/llm";

interface Msg {
  role: "user" | "assistant";
  content: string;
}

const SUGGESTIONS = [
  "Cheapest 4 vCPU / 16 GB general-purpose here?",
  "Best $/vCPU-hr across all providers?",
  "Compare AWS Graviton vs x86 for 8 vCPU.",
  "Cheapest provider for memory-heavy workloads?",
];

export function ChatPanel({ rows }: { rows: InstancePrice[] }) {
  const [open, setOpen] = useState(true);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [err, setErr] = useState<string | null>(null);

  // On the static build VITE_OPENAI_* are unset → chat is hidden entirely.
  if (!llmConfigured()) return null;

  async function ask(question: string) {
    const q = question.trim();
    if (!q || busy) return;
    setErr(null);
    setBusy(true);
    setMsgs((m) => [...m, { role: "user", content: q }]);
    setInput("");
    const { answer, error } = await askLLM({ question: q, rows: rows.slice(0, 400) });
    setBusy(false);
    if (error) {
      setErr(error);
      setMsgs((m) => m.slice(0, -1));
    } else {
      setMsgs((m) => [...m, { role: "assistant", content: answer }]);
    }
  }

  if (!open) {
    return (
      <button className="chat-fab" onClick={() => setOpen(true)}>
        Ask the data ✦
      </button>
    );
  }

  return (
    <section className="chat">
      <header className="chat-head">
        <span>Ask the data ✦</span>
        <button className="x" onClick={() => setOpen(false)}>
          ×
        </button>
      </header>

      <div className="chat-body">
        {msgs.length === 0 && (
          <div className="suggest">
            <p className="muted">
              Ask anything about the {rows.length} rows currently in view — answered by an LLM
              grounded on the live pricing data.
            </p>
            {SUGGESTIONS.map((s) => (
              <button key={s} className="chip" onClick={() => ask(s)}>
                {s}
              </button>
            ))}
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={`msg ${m.role}`}>
            {m.content}
          </div>
        ))}
        {busy && <div className="msg assistant thinking">Thinking…</div>}
        {err && <div className="msg error">{err}</div>}
      </div>

      <form
        className="chat-input"
        onSubmit={(e) => {
          e.preventDefault();
          ask(input);
        }}
      >
        <input
          value={input}
          placeholder="Ask about pricing…"
          onChange={(e) => setInput(e.target.value)}
          disabled={busy}
        />
        <button type="submit" disabled={busy || !input.trim()}>
          Send
        </button>
      </form>
    </section>
  );
}
