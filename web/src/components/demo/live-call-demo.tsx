"use client";

/**
 * Demo mode 2, live microphone (task M.12, PRODUCT_VISION.md §6). Plays a helpline call: the
 * presenter speaks as the caller, and the kept recorder (components/audio) sends a 5 s window every
 * 5 s through /api/demo to the module's /audio endpoint, as the caller's own channel. One live call
 * at a time (the free tier): starting a new one ends an older one. Audio is never stored.
 */
import { useState, type FormEvent } from "react";
import { LiveRecorder } from "@/components/audio/live-recorder";
import type { EmergencyPanel } from "@/contracts/interaction";
import { ConsentFields, FULL_CONSENT, consentRequest, type DemoConsent } from "./consent-fields";
import { LANGUAGE_LABEL, clock } from "./labels";
import { ResultsPanel, type TimelineEvent } from "./results-panel";
import { useModuleResults } from "./use-module-results";

type Lang = "en" | "hi" | "mr" | "ta" | "bn";

interface Session {
  interactionId: string;
  caseId: string | null;
  docketNumber: string;
  channel: string;
}

const FALLBACK: Record<"micRefused" | "unavailable" | "needsConsent", string> = {
  micRefused: "The browser could not use a microphone (refused, or none attached). Allow the microphone for this site and try again.",
  unavailable: "Two windows in a row could not be analysed, so recording stopped. Is the analysis service running? An NHAA app would now switch the person to text.",
  needsConsent: "The module refused the audio: voice analysis consent was not given for this call.",
};

export function LiveCallDemo() {
  const [language, setLanguage] = useState<Lang>("en");
  const [consent, setConsent] = useState<DemoConsent>(FULL_CONSENT);
  const [session, setSession] = useState<Session | null>(null);
  const [ended, setEnded] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [emergency, setEmergency] = useState<EmergencyPanel | null>(null);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const { results, refresh } = useModuleResults(session, { call: true, active: !!session && !ended });

  function note(e: Omit<TimelineEvent, "id" | "at">) {
    setTimeline((t) => [...t, { ...e, id: `${Date.now()}-${t.length}`, at: Date.now() }]);
  }

  async function start(e: FormEvent) {
    e.preventDefault();
    setStarting(true);
    setError(null);
    const res = await fetch("/api/demo/interactions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode: "LIVE_AUDIO", language, consent: consentRequest(consent, language) }),
    });
    const s = (await res.json().catch(() => null)) as (Session & { call: { requestId: string | null; ms: number } }) | null;
    setStarting(false);
    if (res.status !== 201 || !s?.interactionId) {
      setError(`The module did not start the call (HTTP ${res.status}).`);
      return;
    }
    setSession({ interactionId: s.interactionId, caseId: s.caseId, docketNumber: s.docketNumber, channel: s.channel });
    setEnded(false);
    setNotice(null);
    setEmergency(null);
    setTimeline([]);
    note({ label: "Call started", detail: "caller's own channel, live", state: "ok", requestId: s.call.requestId, ms: s.call.ms });
  }

  /** The recorder's delivery: one window through the demo relay. Returns the module's own reply. */
  async function send(form: FormData): Promise<Response | null> {
    if (!session) return null;
    const idx = Number(form.get("windowIndex"));
    const startMs = Number(form.get("startMs"));
    const res = await fetch(`/api/demo/interactions/${session.interactionId}/audio`, { method: "POST", body: form }).catch(() => null);
    if (!res) {
      note({ label: `Window ${idx + 1}`, detail: "network error, retrying", state: "error" });
      return null;
    }
    const body = (await res
      .clone()
      .json()
      .catch(() => null)) as { analysed?: boolean; code?: string } | null;
    const ms = Number(res.headers.get("x-module-ms") ?? "");
    note({
      label: `Window ${idx + 1} (from ${clock(startMs)})`,
      detail: res.status === 202 ? (body?.analysed ? "202 · transcribed and analysed" : "202 · not analysed") : `refused: ${body?.code ?? res.status}`,
      state: res.status === 202 ? (body?.analysed ? "ok" : "warn") : "error",
      requestId: res.headers.get("x-module-request-id"),
      ms: Number.isFinite(ms) ? ms : undefined,
    });
    void refresh();
    return res;
  }

  async function endCall() {
    if (!session || ended) return;
    const r = await fetch(`/api/demo/interactions/${session.interactionId}/end`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    setEnded(true);
    note({ label: "Call ended", detail: String(r.status), state: "ok" });
    void refresh();
  }

  const transcript = results.transcript.filter((m) => m.modality === "VOICE_TRANSCRIPT");

  return (
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_26rem]">
      <div className="flex min-w-0 flex-col gap-4">
        {!session ? (
          <form onSubmit={start} className="card grid gap-5 p-5 md:grid-cols-2" aria-label="Start a live call">
            <div className="flex flex-col gap-4">
              <div>
                <h2 className="text-base font-bold">Start a helpline call</h2>
                <p className="mt-1 text-sm text-ink-2">
                  You speak as the caller. Your microphone is the caller&apos;s own channel, so no speaker separation is needed. Speak calmly, using a synthetic story only.
                </p>
              </div>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-xs font-semibold text-ink-2">Language you will speak</span>
                <select className="field" value={language} onChange={(e) => setLanguage(e.target.value as Lang)} data-testid="call-language">
                  {Object.entries(LANGUAGE_LABEL).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </label>
              <p className="border-l-[3px] border-line pl-3 text-xs text-muted-foreground">
                One live call at a time (free tier): starting a call ends any other live demo call. Audio is analysed in memory and never stored.
              </p>
            </div>
            <div className="flex flex-col justify-between gap-4">
              <ConsentFields value={consent} onChange={setConsent} need="voiceAnalysis" />
              <div className="flex items-center gap-3">
                <button type="submit" className="btn btn-primary" disabled={starting} data-testid="start-call">
                  {starting ? "Connecting…" : "Start call"}
                </button>
                {error && (
                  <p role="alert" className="text-sm text-danger">
                    {error}
                  </p>
                )}
              </div>
            </div>
          </form>
        ) : (
          <section className="card flex flex-col overflow-hidden" aria-label="Live call">
            <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-[#eef1f5] px-4 py-2.5">
              <div className="leading-tight">
                <p className="text-sm font-bold">Helpline call (simulated) · live microphone</p>
                <p className="text-xs text-ink-2">
                  {LANGUAGE_LABEL[language]} · <span className="font-mono">{session.docketNumber}</span>
                </p>
              </div>
              {ended ? (
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setSession(null)}>
                  New call
                </button>
              ) : (
                <button type="button" className="btn btn-secondary btn-sm" onClick={endCall} data-testid="end-call">
                  End call
                </button>
              )}
            </header>
            <div className="flex flex-col gap-4 px-4 py-4">
              {!ended && (
                <LiveRecorder
                  interactionId={session.interactionId}
                  send={send}
                  onEmergency={setEmergency}
                  onFinished={endCall}
                  onFallback={(reason) => {
                    setNotice(FALLBACK[reason]);
                    note({ label: "Recording stopped", detail: reason, state: "error" });
                  }}
                />
              )}
              {notice && (
                <p role="alert" className="border-l-[3px] border-warn bg-[#fbf1df] px-3 py-2 text-sm">
                  {notice}
                </p>
              )}
              {emergency && (
                <div className="border border-danger bg-danger-soft px-3 py-2 text-sm" data-testid="emergency">
                  <p className="text-[0.68rem] font-bold uppercase tracking-wide text-danger">What the helpline app shows the caller now</p>
                  <p className="mt-0.5">{emergency.message}</p>
                  <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5">
                    {emergency.numbers.map((n) => (
                      <li key={n.number}>
                        {n.label}: <strong className="font-mono">{n.number}</strong>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            <div className="border-t border-line px-4 py-3">
              <h3 className="section-title mb-2">Transcript (caller)</h3>
              <ol className="flex max-h-[22rem] flex-col gap-1.5 overflow-y-auto pr-1 text-sm" data-testid="call-transcript">
                {transcript.map((m) => (
                  <li key={m.id}>{m.text}</li>
                ))}
                {transcript.length === 0 && <li className="text-muted-foreground">Appears a few seconds after you speak.</li>}
              </ol>
            </div>
          </section>
        )}
      </div>

      <div className="xl:sticky xl:top-4">
        <ResultsPanel
          live={!!session && !ended}
          onRefresh={session ? () => void refresh() : undefined}
          summary={{
            mode: "Live microphone",
            channel: session?.channel ?? "VOICE_CALL",
            inputMethod: "LIVE_AUDIO",
            language,
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
