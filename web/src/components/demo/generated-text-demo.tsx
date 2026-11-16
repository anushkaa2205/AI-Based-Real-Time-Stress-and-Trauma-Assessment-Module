"use client";

/**
 * Demo mode 4, generated text (task M.13, PRODUCT_VISION.md §6). An LLM on the free Groq quota writes
 * a SYNTHETIC chatbot conversation from options the presenter picks; the conversation is shown,
 * labelled synthetic, and then played through the module's /messages one line at a time, exactly
 * like a chat from NHAA's chatbot. The chatbot's lines are NHAA's scripted questions only.
 * There is no expected label: the requested tone is an input option, not a result.
 */
import { useState, type FormEvent } from "react";
import { ConsentFields, FULL_CONSENT, consentRequest, type DemoConsent } from "./consent-fields";
import { LANGUAGE_LABEL, lower, seconds } from "./labels";
import { ResultsPanel, type TimelineEvent } from "./results-panel";
import { useModuleResults } from "./use-module-results";

type Lang = "en" | "hi" | "mr" | "ta" | "bn";
type Turn = { speaker: "CHATBOT" | "PERSON"; text: string };

const TOPICS: Record<string, string> = {
  THREAT_INTIMIDATION: "Threats or intimidation",
  PHYSICAL_ATTACK: "A physical attack (not graphic)",
  SOCIAL_BOYCOTT: "Social boycott",
  PROPERTY_DAMAGE: "Property damage",
  PRESSURE_TO_WITHDRAW: "Pressure to withdraw the complaint",
  CASE_STATUS: "Case status question, no distress",
};
const LENGTHS = { short: "Short (4 lines)", medium: "Medium (8 lines)", long: "Long (12 lines)" } as const;
const TONES = { calm: "Calm", worried: "Worried", distressed: "Very distressed" } as const;

interface Played extends Turn {
  state: "pending" | "sending" | "sent" | "failed";
  status?: number;
  ms?: number;
  emergency?: boolean;
}

interface Session {
  interactionId: string;
  caseId: string | null;
  docketNumber: string;
  channel: string;
}

async function postJson<T>(url: string, body: unknown): Promise<{ status: number; data: T | null }> {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return { status: res.status, data: (await res.json().catch(() => null)) as T | null };
}

export function GeneratedTextDemo() {
  const [opts, setOpts] = useState({ category: "PRESSURE_TO_WITHDRAW", language: "en" as Lang, length: "short" as keyof typeof LENGTHS, tone: "worried" as keyof typeof TONES });
  const [consent, setConsent] = useState<DemoConsent>(FULL_CONSENT);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ turns: Turn[]; modelVersion: string } | null>(null);
  const [lines, setLines] = useState<Played[]>([]);
  const [session, setSession] = useState<Session | null>(null);
  const [playing, setPlaying] = useState(false);
  const [ended, setEnded] = useState(false);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const { results, refresh } = useModuleResults(session, { active: !!session && !ended });

  function note(e: Omit<TimelineEvent, "id" | "at">) {
    setTimeline((t) => [...t, { ...e, id: `${Date.now()}-${t.length}`, at: Date.now() }]);
  }

  async function generate(e: FormEvent) {
    e.preventDefault();
    setGenerating(true);
    setError(null);
    const t0 = Date.now();
    const r = await postJson<{ turns: Turn[]; modelVersion: string; detail?: string }>("/api/demo/generate", opts);
    setGenerating(false);
    if (r.status !== 200 || !r.data?.turns) {
      setError(r.data?.detail ?? `The generator did not answer (HTTP ${r.status}).`);
      return;
    }
    setDraft({ turns: r.data.turns, modelVersion: r.data.modelVersion });
    setSession(null);
    setEnded(false);
    setLines([]);
    setTimeline([{ id: "gen", at: Date.now(), label: "Synthetic conversation generated", detail: `${r.data.turns.length} lines · ${r.data.modelVersion}`, state: "ok", ms: Date.now() - t0 }]);
  }

  async function play() {
    if (!draft || playing) return;
    setPlaying(true);
    const start = await postJson<Session & { call: { requestId: string | null; ms: number } }>("/api/demo/interactions", {
      mode: "GENERATED_TEXT",
      language: opts.language,
      consent: consentRequest(consent, opts.language),
    });
    if (start.status !== 201 || !start.data?.interactionId) {
      setError(`The module did not start the interaction (HTTP ${start.status}).`);
      setPlaying(false);
      return;
    }
    const s = start.data;
    setSession({ interactionId: s.interactionId, caseId: s.caseId, docketNumber: s.docketNumber, channel: s.channel });
    note({ label: "Interaction started", state: "ok", requestId: s.call.requestId, ms: s.call.ms });
    const queue: Played[] = draft.turns.map((t) => ({ ...t, state: "pending" }));
    setLines(queue);

    // One line at a time, in order, like a chat (never in parallel).
    for (let i = 0; i < queue.length; i++) {
      const t = queue[i]!;
      setLines((ls) => ls.map((l, j) => (j === i ? { ...l, state: "sending" } : l)));
      const r = await postJson<{ status: number; body: { showEmergencyPanel?: boolean } | null; call: { requestId: string | null; ms: number } }>(
        `/api/demo/interactions/${s.interactionId}/messages`,
        { text: t.text, sender: t.speaker === "CHATBOT" ? "OPERATOR" : "VICTIM" },
      );
      const status = r.data?.status ?? r.status;
      const ok = status === 201 || status === 200;
      const emergency = r.data?.body?.showEmergencyPanel === true;
      setLines((ls) => ls.map((l, j) => (j === i ? { ...l, state: ok ? "sent" : "failed", status, ms: r.data?.call.ms, emergency } : l)));
      note({
        label: t.speaker === "CHATBOT" ? `Line ${i + 1}: chatbot question stored (not scored)` : `Line ${i + 1}: person's message analysed`,
        detail: ok ? `${status}${emergency ? " · emergency options shown" : ""}` : `failed: ${status}`,
        state: ok ? (emergency ? "warn" : "ok") : "error",
        requestId: r.data?.call.requestId,
        ms: r.data?.call.ms,
      });
      if (ok && t.speaker === "PERSON") void refresh();
      await new Promise((ok2) => setTimeout(ok2, 400));
    }
    setPlaying(false);
    void refresh();
  }

  async function end() {
    if (!session) return;
    const r = await postJson<{ status: number }>(`/api/demo/interactions/${session.interactionId}/end`, {});
    setEnded(true);
    note({ label: "Interaction ended", detail: String(r.data?.status ?? r.status), state: "ok" });
    void refresh();
  }

  const select = (label: string, value: string, onChange: (v: string) => void, options: Record<string, string>, testId?: string) => (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-xs font-semibold text-ink-2">{label}</span>
      <select className="field" value={value} onChange={(e) => onChange(e.target.value)} disabled={playing} data-testid={testId}>
        {Object.entries(options).map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_26rem]">
      <div className="flex min-w-0 flex-col gap-4">
        <form onSubmit={generate} className="card grid gap-5 p-5 md:grid-cols-2" aria-label="Generate a synthetic conversation">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <h2 className="text-base font-bold">Generate a synthetic conversation</h2>
              <p className="mt-1 text-sm text-ink-2">Written by an LLM from these options. Invented, respectful and non-graphic; the chatbot uses only NHAA&apos;s scripted questions.</p>
            </div>
            {select("Topic", opts.category, (v) => setOpts({ ...opts, category: v }), TOPICS, "gen-topic")}
            {select("Language", opts.language, (v) => setOpts({ ...opts, language: v as Lang }), LANGUAGE_LABEL, "gen-language")}
            {select("Length", opts.length, (v) => setOpts({ ...opts, length: v as keyof typeof LENGTHS }), LENGTHS)}
            {select("How the person sounds", opts.tone, (v) => setOpts({ ...opts, tone: v as keyof typeof TONES }), TONES, "gen-tone")}
          </div>
          <div className="flex flex-col justify-between gap-4">
            <ConsentFields value={consent} onChange={setConsent} disabled={playing} />
            <div className="flex flex-wrap items-center gap-3">
              <button type="submit" className="btn btn-secondary" disabled={generating || playing} data-testid="generate">
                {generating ? "Writing…" : draft ? "Generate again" : "Generate"}
              </button>
              {error && (
                <p role="alert" className="text-sm text-danger">
                  {error}
                </p>
              )}
            </div>
          </div>
        </form>

        {draft && (
          <section className="card flex flex-col overflow-hidden" aria-label="Generated conversation" data-testid="generated">
            <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-[#eef1f5] px-4 py-2.5">
              <div className="leading-tight">
                <p className="flex items-center gap-2 text-sm font-bold">
                  NHAA chatbot (simulated)
                  <span className="tag border-[#b07a1f] bg-[#fdf3dc] text-[0.68rem] uppercase tracking-wide text-[#5c3a00]">Synthetic</span>
                </p>
                <p className="text-xs text-ink-2">
                  {TOPICS[opts.category]} · {LANGUAGE_LABEL[opts.language]} · {lower(opts.tone)} · <span className="font-mono">{draft.modelVersion}</span>
                  {session && (
                    <>
                      {" "}
                      · <span className="font-mono">{session.docketNumber}</span>
                    </>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {!session && (
                  <button type="button" className="btn btn-primary btn-sm" onClick={play} disabled={playing} data-testid="play-generated">
                    Play through the module
                  </button>
                )}
                {session && !playing && !ended && (
                  <button type="button" className="btn btn-secondary btn-sm" onClick={end} data-testid="end">
                    End conversation
                  </button>
                )}
                {ended && <span className="text-xs font-semibold text-ink-2">Conversation ended</span>}
              </div>
            </header>
            <ol className="flex flex-col gap-3 bg-[#fbfaf7] px-4 py-4" data-testid="generated-chat">
              {(session ? lines : draft.turns.map((t) => ({ ...t, state: "pending" as const }))).map((l, i) => (
                <li key={i} className={`flex flex-col gap-1 ${l.speaker === "PERSON" ? "items-end" : "items-start"}`}>
                  <span className="px-1 text-[0.68rem] font-semibold uppercase tracking-wide text-muted-foreground">{l.speaker === "PERSON" ? "Person (synthetic)" : "NHAA chatbot"}</span>
                  <p
                    className={`max-w-[34rem] whitespace-pre-wrap rounded-[4px] border px-3 py-2 text-[0.95rem] leading-snug ${
                      l.speaker === "PERSON" ? "border-navy bg-navy text-white" : "border-line bg-white text-ink"
                    } ${l.state === "pending" ? "opacity-55" : ""} ${l.state === "failed" ? "opacity-60" : ""}`}
                  >
                    {l.text}
                  </p>
                  {"status" in l && l.state !== "pending" && (
                    <span className="px-1 font-mono text-[0.68rem] text-muted-foreground">
                      {l.state === "sending" ? "sending…" : l.state === "failed" ? `not accepted (${l.status})` : `${l.status} · ${l.ms !== undefined ? seconds(l.ms) : ""}${l.speaker === "CHATBOT" ? " · stored, not scored" : ""}${l.emergency ? " · emergency options shown" : ""}`}
                    </span>
                  )}
                </li>
              ))}
            </ol>
            {!session && <p className="border-t border-line px-4 py-2 text-xs text-muted-foreground">Not sent yet. Read it first; nothing reaches the module until you press Play.</p>}
          </section>
        )}
      </div>

      <div className="xl:sticky xl:top-4">
        <ResultsPanel
          live={!!session && !ended}
          onRefresh={session ? () => void refresh() : undefined}
          summary={{
            mode: "Generated text (synthetic)",
            channel: session?.channel ?? "CHATBOT",
            inputMethod: "TEXT",
            language: opts.language,
            scenarioId: null,
            docketNumber: session?.docketNumber ?? null,
            interactionId: session?.interactionId ?? null,
            caseId: session?.caseId ?? null,
          }}
          results={results}
          timeline={timeline}
        />
      </div>
    </div>
  );
}
