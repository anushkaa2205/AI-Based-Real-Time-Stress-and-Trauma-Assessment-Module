"use client";

/**
 * Demo mode 1, live text (task M.11, PRODUCT_VISION.md §6). A chat window that plays the part of
 * NHAA's chatbot: each message goes, one at a time, through /api/demo to the module's integration
 * API with the demo key. The person's messages are typed by the presenter; the chatbot's questions
 * are NHAA's scripted wording and arrive at the module as OPERATOR turns, never scored. The module
 * itself asks nothing. A scenario's text version can be replayed line by line.
 */
import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { ConsentFields, FULL_CONSENT, consentRequest, type DemoConsent } from "./consent-fields";
import { LANGUAGE_LABEL, seconds } from "./labels";
import { ResultsPanel, type Expected, type TimelineEvent } from "./results-panel";
import { useModuleResults } from "./use-module-results";

type Lang = "en" | "hi" | "mr" | "ta" | "bn";
type Sender = "VICTIM" | "OPERATOR";

export interface TextScenario {
  id: string;
  title: string;
  languageTag: string;
  language: Lang;
  script: { speaker: "OPERATOR" | "CALLER"; text: string }[];
  expected: Expected;
}

interface Emergency {
  numbers: { label: string; number: string }[];
  message: string;
}

interface ChatLine {
  key: string;
  sender: Sender;
  text: string;
  state: "sending" | "sent" | "failed";
  status?: number;
  ms?: number;
  requestId?: string | null;
  emergency?: Emergency | null;
  error?: string;
}

interface Session {
  interactionId: string;
  caseId: string | null;
  docketNumber: string;
  channel: string;
}

async function post<T>(url: string, body: unknown): Promise<{ ok: boolean; status: number; data: T | null }> {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  let data: T | null = null;
  try {
    data = (await res.json()) as T;
  } catch {
    data = null;
  }
  return { ok: res.ok, status: res.status, data };
}

export function LiveTextDemo({ scenarios, questions }: { scenarios: TextScenario[]; questions: Record<Lang, { key: string; text: string }[]> }) {
  const [language, setLanguage] = useState<Lang>("en");
  const [consent, setConsent] = useState<DemoConsent>(FULL_CONSENT);
  const [scenarioId, setScenarioId] = useState<string>("");
  const [session, setSession] = useState<Session | null>(null);
  const [ended, setEnded] = useState(false);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [lines, setLines] = useState<ChatLine[]>([]);
  const [draft, setDraft] = useState("");
  const [sender, setSender] = useState<Sender>("VICTIM");
  const [step, setStep] = useState(0);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const listRef = useRef<HTMLOListElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scenario = useMemo(() => scenarios.find((s) => s.id === scenarioId) ?? null, [scenarios, scenarioId]);
  const { results, refresh } = useModuleResults(session, { active: !!session && !ended });
  const nextLine = scenario && step < scenario.script.length ? scenario.script[step]! : null;
  const sending = lines.some((l) => l.state === "sending");

  useEffect(() => {
    listRef.current?.lastElementChild?.scrollIntoView({ block: "nearest" });
  }, [lines]);

  function note(e: Omit<TimelineEvent, "id" | "at">) {
    setTimeline((t) => [...t, { ...e, id: `${Date.now()}-${t.length}`, at: Date.now() }]);
  }

  async function start(e: FormEvent) {
    e.preventDefault();
    setStarting(true);
    setStartError(null);
    const lang = scenario?.language ?? language;
    const r = await post<{ interactionId: string; caseId: string | null; docketNumber: string; channel: string; call: { requestId: string | null; ms: number }; status?: number }>("/api/demo/interactions", {
      mode: "LIVE_TEXT",
      language: lang,
      consent: consentRequest(consent, lang),
      ...(scenario ? { scenarioId: scenario.id } : {}),
    });
    setStarting(false);
    if (r.status !== 201 || !r.data?.interactionId) {
      setStartError(`The module did not start the interaction (HTTP ${r.data?.status ?? r.status}).`);
      return;
    }
    setLanguage(lang);
    setSession({ interactionId: r.data.interactionId, caseId: r.data.caseId, docketNumber: r.data.docketNumber, channel: r.data.channel });
    setTimeline([]);
    note({ label: "Interaction started", detail: `consent: ${Object.entries(consent).filter(([, v]) => v).map(([k]) => k.replace(/([A-Z])/g, " $1").toLowerCase()).join(", ") || "safety only"}`, state: "ok", requestId: r.data.call.requestId, ms: r.data.call.ms });
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  async function send(text: string, who: Sender) {
    if (!session || ended || !text.trim()) return;
    const key = `${Date.now()}-${lines.length}`;
    setLines((ls) => [...ls, { key, sender: who, text: text.trim(), state: "sending" }]);
    const r = await post<{ status: number; body: { showEmergencyPanel?: boolean; emergency?: Emergency | null; code?: string; title?: string } | null; call: { requestId: string | null; ms: number } }>(
      `/api/demo/interactions/${session.interactionId}/messages`,
      { text: text.trim(), sender: who },
    );
    const status = r.data?.status ?? r.status;
    const ok = status === 201 || status === 200;
    setLines((ls) =>
      ls.map((l) =>
        l.key === key
          ? {
              ...l,
              state: ok ? "sent" : "failed",
              status,
              ms: r.data?.call.ms,
              requestId: r.data?.call.requestId,
              emergency: r.data?.body?.showEmergencyPanel ? (r.data.body.emergency ?? null) : null,
              error: ok ? undefined : (r.data?.body?.title ?? `HTTP ${status}`),
            }
          : l,
      ),
    );
    note({
      label: who === "VICTIM" ? "Person's message analysed" : "Chatbot question stored (not scored)",
      detail: ok ? `${status}${r.data?.body?.showEmergencyPanel ? " · emergency options shown" : ""}` : `failed: ${r.data?.body?.title ?? status}`,
      state: ok ? (r.data?.body?.showEmergencyPanel ? "warn" : "ok") : "error",
      requestId: r.data?.call.requestId,
      ms: r.data?.call.ms,
    });
    if (ok && who === "VICTIM") void refresh();
  }

  async function submit(e?: FormEvent) {
    e?.preventDefault();
    const text = draft;
    setDraft("");
    if (nextLine && text.trim() === nextLine.text && (nextLine.speaker === "OPERATOR" ? "OPERATOR" : "VICTIM") === sender) setStep((s) => s + 1);
    await send(text, sender);
    inputRef.current?.focus();
  }

  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void submit();
    }
  }

  async function sendNextLine() {
    if (!nextLine) return;
    setStep((s) => s + 1);
    await send(nextLine.text, nextLine.speaker === "OPERATOR" ? "OPERATOR" : "VICTIM");
  }

  async function end() {
    if (!session) return;
    const r = await post<{ status: number; call: { requestId: string | null; ms: number } }>(`/api/demo/interactions/${session.interactionId}/end`, {});
    setEnded(true);
    note({ label: "Interaction ended", detail: String(r.data?.status ?? r.status), state: "ok", requestId: r.data?.call.requestId, ms: r.data?.call.ms });
    void refresh();
  }

  function reset() {
    setSession(null);
    setEnded(false);
    setLines([]);
    setTimeline([]);
    setStep(0);
    setDraft("");
  }

  const qs = questions[language] ?? questions.en;

  return (
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_26rem]">
      <div className="flex min-w-0 flex-col gap-4">
        {!session ? (
          <form onSubmit={start} className="card grid gap-5 p-5 md:grid-cols-2" aria-label="Start a demo conversation">
            <div className="flex flex-col gap-4">
              <div>
                <h2 className="text-base font-bold">Start a chatbot conversation</h2>
                <p className="mt-1 text-sm text-ink-2">The NHAA chatbot has already greeted the person and collected consent. Choose what it collected, then type as the person.</p>
              </div>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-xs font-semibold text-ink-2">Scenario (optional)</span>
                <select className="field" value={scenarioId} onChange={(e) => setScenarioId(e.target.value)} data-testid="scenario-select">
                  <option value="">None: type freely</option>
                  {scenarios.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.id} · {s.title} ({LANGUAGE_LABEL[s.language] ?? s.language})
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-xs font-semibold text-ink-2">Language</span>
                <select className="field" value={scenario?.language ?? language} disabled={!!scenario} onChange={(e) => setLanguage(e.target.value as Lang)}>
                  {Object.entries(LANGUAGE_LABEL).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="flex flex-col justify-between gap-4">
              <ConsentFields value={consent} onChange={setConsent} />
              <div className="flex items-center gap-3">
                <button type="submit" className="btn btn-primary" disabled={starting} data-testid="start">
                  {starting ? "Starting…" : "Start conversation"}
                </button>
                {startError && (
                  <p role="alert" className="text-sm text-danger">
                    {startError}
                  </p>
                )}
              </div>
            </div>
          </form>
        ) : (
          <section className="card flex min-h-[34rem] flex-col overflow-hidden" aria-label="Simulated NHAA chatbot">
            <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-[#eef1f5] px-4 py-2.5">
              <div className="flex items-center gap-2.5">
                <span aria-hidden className="grid size-8 place-items-center rounded-[3px] bg-brand text-[0.62rem] font-bold text-white">
                  14566
                </span>
                <div className="leading-tight">
                  <p className="text-sm font-bold">NHAA chatbot</p>
                  <p className="text-xs text-ink-2">
                    simulated · {LANGUAGE_LABEL[language]} · <span className="font-mono">{session.docketNumber}</span>
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {ended ? (
                  <>
                    <span className="text-xs font-semibold text-ink-2">Conversation ended</span>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={reset}>
                      New conversation
                    </button>
                  </>
                ) : (
                  <button type="button" className="btn btn-secondary btn-sm" onClick={end} data-testid="end">
                    End conversation
                  </button>
                )}
              </div>
            </header>

            <ol ref={listRef} className="flex flex-1 flex-col gap-3 overflow-y-auto bg-[#fbfaf7] px-4 py-4" aria-live="polite" data-testid="chat">
              {lines.length === 0 && (
                <li className="m-auto max-w-sm text-center text-sm text-muted-foreground">
                  Type as the person, or ask one of NHAA&apos;s scripted questions as the chatbot. {scenario ? "The scenario script is below." : ""}
                </li>
              )}
              {lines.map((l) => (
                <li key={l.key} className={`flex flex-col gap-1 ${l.sender === "VICTIM" ? "items-end" : "items-start"}`} data-testid={l.sender === "VICTIM" ? "msg-person" : "msg-chatbot"}>
                  <span className="px-1 text-[0.68rem] font-semibold uppercase tracking-wide text-muted-foreground">{l.sender === "VICTIM" ? "Person" : "NHAA chatbot"}</span>
                  <p
                    className={`max-w-[34rem] whitespace-pre-wrap rounded-[4px] border px-3 py-2 text-[0.95rem] leading-snug ${
                      l.sender === "VICTIM" ? "border-brand bg-brand text-white" : "border-line bg-white text-ink"
                    } ${l.state === "failed" ? "opacity-60" : ""}`}
                  >
                    {l.text}
                  </p>
                  <span className="px-1 font-mono text-[0.68rem] text-muted-foreground" data-testid="msg-status">
                    {l.state === "sending" ? "sending…" : l.state === "failed" ? `not accepted: ${l.error}` : `${l.status} · ${l.ms !== undefined ? seconds(l.ms) : ""}${l.sender === "OPERATOR" ? " · stored, not scored" : ""}`}
                  </span>
                  {l.emergency && (
                    <div className="mt-1 max-w-[34rem] border border-danger bg-danger-soft px-3 py-2 text-sm" data-testid="emergency">
                      <p className="text-[0.68rem] font-bold uppercase tracking-wide text-danger">What the chatbot shows the person now</p>
                      <p className="mt-0.5">{l.emergency.message}</p>
                      <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5">
                        {l.emergency.numbers.map((n) => (
                          <li key={n.number}>
                            {n.label}: <strong className="font-mono">{n.number}</strong>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </li>
              ))}
            </ol>

            {!ended && (
              <div className="border-t border-line bg-white">
                {nextLine && (
                  <div className="flex flex-wrap items-center gap-3 border-b border-line bg-[#f6f4ef] px-4 py-2 text-sm" data-testid="script-next">
                    <span className="font-mono text-xs text-muted-foreground">
                      {scenario!.id} · line {step + 1}/{scenario!.script.length}
                    </span>
                    <span className="min-w-0 flex-1 truncate">
                      <strong className="font-semibold">{nextLine.speaker === "OPERATOR" ? "Chatbot" : "Person"}:</strong> {nextLine.text}
                    </span>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={sendNextLine} disabled={sending}>
                      Send this line
                    </button>
                  </div>
                )}
                <form onSubmit={submit} className="flex flex-col gap-2 px-4 py-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <div role="radiogroup" aria-label="Send as" className="inline-flex overflow-hidden rounded-[3px] border border-input text-sm">
                      {(["VICTIM", "OPERATOR"] as const).map((s) => (
                        <button
                          key={s}
                          type="button"
                          role="radio"
                          aria-checked={sender === s}
                          onClick={() => setSender(s)}
                          className={`px-3 py-1 ${sender === s ? "bg-brand font-semibold text-white" : "bg-white text-ink hover:bg-muted"} ${s === "OPERATOR" ? "border-l border-input" : ""}`}
                        >
                          {s === "VICTIM" ? "Person" : "Chatbot"}
                        </button>
                      ))}
                    </div>
                    <label className="flex min-w-0 flex-1 items-center gap-2 text-xs text-ink-2">
                      <span className="shrink-0">Chatbot question</span>
                      <select
                        className="field min-w-0 flex-1 py-1 text-sm"
                        value=""
                        onChange={(e) => {
                          const q = qs.find((x) => x.key === e.target.value);
                          if (q) {
                            setDraft(q.text);
                            setSender("OPERATOR");
                            inputRef.current?.focus();
                          }
                        }}
                        data-testid="question-picker"
                      >
                        <option value="">Insert one of NHAA&apos;s scripted questions…</option>
                        {qs.map((q) => (
                          <option key={q.key} value={q.key}>
                            {q.text}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className="flex items-end gap-2">
                    <label className="sr-only" htmlFor="demo-draft">
                      Message
                    </label>
                    <textarea
                      id="demo-draft"
                      ref={inputRef}
                      rows={2}
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={onKey}
                      maxLength={2000}
                      placeholder={sender === "VICTIM" ? "Type what the person writes…" : "Type the chatbot's question…"}
                      className="field min-h-[2.75rem] flex-1 resize-y"
                      data-testid="draft"
                    />
                    <button type="submit" className="btn btn-primary" disabled={!draft.trim() || sending} data-testid="send">
                      Send
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground">Enter sends, Shift+Enter adds a line. Synthetic text only.</p>
                </form>
              </div>
            )}
          </section>
        )}
      </div>

      <div className="xl:sticky xl:top-4">
        <ResultsPanel
          live={!!session && !ended}
          onRefresh={session ? () => void refresh() : undefined}
          summary={{
            mode: "Live text",
            inputMethod: "TEXT",
            channel: session?.channel ?? "CHATBOT",
            language: scenario?.language ?? language,
            scenarioId: scenario?.id ?? null,
            docketNumber: session?.docketNumber ?? null,
            interactionId: session?.interactionId ?? null,
            caseId: session?.caseId ?? null,
          }}
          results={results}
          timeline={timeline}
          expected={scenario?.expected ?? null}
        />
      </div>
    </div>
  );
}
