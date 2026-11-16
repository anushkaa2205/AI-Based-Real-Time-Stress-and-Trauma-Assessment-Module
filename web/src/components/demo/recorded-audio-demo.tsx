"use client";

/**
 * Demo mode 3, recorded audio library (task M.14, PRODUCT_VISION.md §6). Plays a team recording
 * (or an uploaded WAV) through the module like a helpline call: the server cuts it into 5 s
 * windows and sends each to the integration API's /audio in order (task M.8). The real audio
 * goes through the real audio path; nothing is transcribed or labelled here.
 */
import { useMemo, useRef, useState, type FormEvent } from "react";
import type { RecordingEvent } from "@/contracts/demo";
import { ConsentFields, FULL_CONSENT, consentRequest, type DemoConsent } from "./consent-fields";
import { LANGUAGE_LABEL, clock, seconds } from "./labels";
import { ResultsPanel, type Expected, type TimelineEvent } from "./results-panel";
import { useModuleResults } from "./use-module-results";

type Lang = "en" | "hi" | "mr" | "ta" | "bn";

export interface LibraryScenario {
  id: string;
  title: string;
  languageTag: string;
  language: Lang;
  audioSource: "CALLER_ONLY" | "MIXED";
  firstSpeaker: "OPERATOR" | "CALLER";
  script: { speaker: "OPERATOR" | "CALLER"; text: string }[];
  expected: Expected;
  recordingAvailable: boolean;
}

interface Session {
  interactionId: string;
  caseId: string | null;
  docketNumber: string;
  channel: string;
}

type WindowRow = Extract<RecordingEvent, { type: "window" }>;

interface Run {
  source: "library" | "upload";
  scenario: LibraryScenario | null;
  fileName: string | null;
  language: Lang;
  audioSource: "CALLER_ONLY" | "MIXED";
  total: number | null;
  durationMs: number | null;
  windows: WindowRow[];
  state: "starting" | "playing" | "done" | "failed";
  error: string | null;
}

export function RecordedAudioDemo({ library }: { library: LibraryScenario[] }) {
  const [consent, setConsent] = useState<DemoConsent>(FULL_CONSENT);
  const [session, setSession] = useState<Session | null>(null);
  const [ended, setEnded] = useState(false);
  const [run, setRun] = useState<Run | null>(null);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [openScript, setOpenScript] = useState<string | null>(null);
  const [upload, setUpload] = useState<{ file: File | null; language: Lang; audioSource: "CALLER_ONLY" | "MIXED"; firstSpeaker: "OPERATOR" | "CALLER" }>({ file: null, language: "en", audioSource: "MIXED", firstSpeaker: "OPERATOR" });
  const fileRef = useRef<HTMLInputElement>(null);
  const playing = run?.state === "starting" || run?.state === "playing";
  const { results, refresh } = useModuleResults(session, { call: true, active: !!session && !ended });
  const recorded = useMemo(() => library.filter((s) => s.recordingAvailable).length, [library]);

  function note(e: Omit<TimelineEvent, "id" | "at">) {
    setTimeline((t) => [...t, { ...e, id: `${Date.now()}-${t.length}`, at: Date.now() }]);
  }

  async function play(source: "library" | "upload", scenario: LibraryScenario | null) {
    if (playing) return;
    const language = scenario?.language ?? upload.language;
    const audioSource = scenario?.audioSource ?? upload.audioSource;
    setEnded(false);
    setTimeline([]);
    setRun({ source, scenario, fileName: source === "upload" ? (upload.file?.name ?? null) : null, language, audioSource, total: null, durationMs: null, windows: [], state: "starting", error: null });

    const startRes = await fetch("/api/demo/interactions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode: "RECORDED_AUDIO", language, consent: consentRequest(consent, language), ...(scenario ? { scenarioId: scenario.id } : {}) }),
    });
    const started = (await startRes.json().catch(() => null)) as (Session & { call: { requestId: string | null; ms: number } }) | null;
    if (startRes.status !== 201 || !started?.interactionId) {
      setRun((r) => (r ? { ...r, state: "failed", error: `The module did not start the call (HTTP ${startRes.status}).` } : r));
      return;
    }
    const s: Session = { interactionId: started.interactionId, caseId: started.caseId, docketNumber: started.docketNumber, channel: started.channel };
    setSession(s);
    note({ label: "Call started", detail: `${audioSource === "MIXED" ? "both voices on one track" : "caller's channel only"}`, state: "ok", requestId: started.call.requestId, ms: started.call.ms });

    // Each request stops before the hosting time limit and says where to continue ("more").
    let fromWindow = 0;
    let analysedTotal = 0;
    for (let part = 0; part < 200; part++) {
      let res: Response;
      if (source === "library" && scenario) {
        res = await fetch(`/api/demo/interactions/${s.interactionId}/recording`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ scenarioId: scenario.id, fromWindow }),
        });
      } else {
        const form = new FormData();
        form.set("file", upload.file!);
        form.set("audioSource", upload.audioSource);
        form.set("firstSpeaker", upload.firstSpeaker);
        form.set("fromWindow", String(fromWindow));
        res = await fetch(`/api/demo/interactions/${s.interactionId}/recording`, { method: "POST", body: form });
      }
      if (!res.ok || !res.body) {
        const p = (await res.json().catch(() => null)) as { detail?: string; title?: string } | null;
        setRun((r) => (r ? { ...r, state: "failed", error: p?.detail ?? p?.title ?? `HTTP ${res.status}` } : r));
        note({ label: "Recording refused", detail: p?.detail ?? String(res.status), state: "error" });
        return;
      }
      setRun((r) => (r ? { ...r, state: "playing" } : r));

      // NDJSON: one event per line, as each window comes back from the module.
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      let next: number | null = null;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          const ev = JSON.parse(line) as RecordingEvent;
          if (ev.type === "start") {
            setRun((r) => (r ? { ...r, total: ev.windows, durationMs: ev.durationMs } : r));
            if (ev.fromWindow === 0) note({ label: "Recording cut into windows", detail: `${ev.windows} × 5 s, ${clock(ev.durationMs)} in all`, state: "ok" });
          } else if (ev.type === "window") {
            if (ev.analysed) analysedTotal += 1;
            setRun((r) => (r ? { ...r, windows: [...r.windows, ev] } : r));
            note({
              label: `Window ${ev.windowIndex + 1} (${clock(ev.startMs)}–${clock(ev.endMs)})`,
              detail: ev.error ? `failed: ${ev.error}` : ev.analysed ? `${ev.status} · transcribed and analysed` : `${ev.status} · not analysed`,
              state: ev.error ? "error" : ev.analysed ? "ok" : "warn",
              requestId: ev.call.requestId,
              ms: ev.call.ms,
            });
            void refresh();
          } else if (ev.type === "more") {
            next = ev.nextWindow;
          } else if (ev.type === "done") {
            setRun((r) => (r ? { ...r, state: "done" } : r));
            note({ label: "Recording finished", detail: `${analysedTotal} of ${ev.windows} windows analysed`, state: analysedTotal === ev.windows ? "ok" : "warn" });
          } else if (ev.type === "error") {
            setRun((r) => (r ? { ...r, state: "failed", error: ev.message } : r));
            note({ label: "Stopped", detail: ev.message, state: "error" });
          }
        }
      }
      if (next === null) break;
      fromWindow = next;
    }
    void refresh();
  }

  async function endCall() {
    if (!session) return;
    const r = await fetch(`/api/demo/interactions/${session.interactionId}/end`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    setEnded(true);
    note({ label: "Call ended", detail: String(r.status), state: "ok" });
    void refresh();
  }

  function back() {
    setRun(null);
    setSession(null);
    setEnded(false);
    setTimeline([]);
  }

  function chooseUpload(e: FormEvent) {
    e.preventDefault();
    if (upload.file) void play("upload", null);
  }

  const transcript = results.transcript.filter((m) => m.modality === "VOICE_TRANSCRIPT");

  return (
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_26rem]">
      <div className="flex min-w-0 flex-col gap-4">
        {!run ? (
          <>
            <div className="flex flex-col gap-4">
              <div className="grid items-start gap-4 md:grid-cols-2">
                <section className="card p-4" aria-label="Consent">
                  <ConsentFields value={consent} onChange={setConsent} need="voiceAnalysis" />
                </section>
                <form onSubmit={chooseUpload} className="card flex flex-col gap-3 p-4" aria-label="Upload a WAV">
                  <div>
                    <h2 className="text-sm font-bold">Upload a WAV</h2>
                    <p className="text-xs text-muted-foreground">A team recording, PCM WAV, up to 4 MB. Goes through exactly the same path.</p>
                  </div>
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".wav,audio/wav,audio/x-wav"
                    className="text-sm file:mr-3 file:rounded-[3px] file:border file:border-input file:bg-white file:px-2.5 file:py-1 file:text-sm"
                    onChange={(e) => setUpload({ ...upload, file: e.target.files?.[0] ?? null })}
                    data-testid="upload-file"
                  />
                  <label className="flex flex-col gap-1 text-xs font-semibold text-ink-2">
                    Language
                    <select className="field text-sm font-normal" value={upload.language} onChange={(e) => setUpload({ ...upload, language: e.target.value as Lang })}>
                      {Object.entries(LANGUAGE_LABEL).map(([v, l]) => (
                        <option key={v} value={v}>
                          {l}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1 text-xs font-semibold text-ink-2">
                    Voices in the recording
                    <select className="field text-sm font-normal" value={upload.audioSource} onChange={(e) => setUpload({ ...upload, audioSource: e.target.value as "CALLER_ONLY" | "MIXED" })} data-testid="upload-source">
                      <option value="MIXED">Operator and caller on one track</option>
                      <option value="CALLER_ONLY">Caller only</option>
                    </select>
                  </label>
                  {upload.audioSource === "MIXED" && (
                    <label className="flex flex-col gap-1 text-xs font-semibold text-ink-2">
                      Who speaks first
                      <select className="field text-sm font-normal" value={upload.firstSpeaker} onChange={(e) => setUpload({ ...upload, firstSpeaker: e.target.value as "OPERATOR" | "CALLER" })}>
                        <option value="OPERATOR">Operator (the helpline answers)</option>
                        <option value="CALLER">Caller</option>
                      </select>
                    </label>
                  )}
                  <button type="submit" className="btn btn-primary" disabled={!upload.file || !consent.voiceAnalysis} data-testid="upload-play">
                    Play upload through the module
                  </button>
                </form>
              </div>

              <section aria-label="Scenario library" className="flex flex-col gap-3">
                <div className="flex items-baseline justify-between gap-2">
                  <h2 className="text-base font-bold">Scenario library</h2>
                  <p className="text-xs text-muted-foreground">
                    {recorded} of {library.length} recorded
                  </p>
                </div>
                {library.length === 0 && <p className="card p-4 text-sm text-muted-foreground">No library file found (demo/library/library.json).</p>}
                <ul className="flex flex-col gap-2.5" data-testid="library">
                  {library.map((s) => (
                    <li key={s.id} className="card" data-testid="library-item">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 p-3.5">
                        <span className="font-mono text-sm font-bold text-brand">{s.id}</span>
                        <div className="min-w-0 flex-1 basis-56">
                          <p className="text-sm font-semibold leading-snug">{s.title}</p>
                          <p className="text-xs text-muted-foreground">
                            {LANGUAGE_LABEL[s.language] ?? s.language}
                            {s.languageTag !== s.language ? ` (${s.languageTag})` : ""} · {s.audioSource === "MIXED" ? "operator and caller" : "caller only"} · {s.script.length} lines
                          </p>
                        </div>
                        {s.recordingAvailable ? (
                          <span className="text-xs font-semibold text-ok">Recorded</span>
                        ) : (
                          <span className="text-xs text-muted-foreground">Not recorded yet</span>
                        )}
                        <button type="button" className="btn btn-secondary btn-sm" aria-expanded={openScript === s.id} onClick={() => setOpenScript(openScript === s.id ? null : s.id)}>
                          {openScript === s.id ? "Hide script" : "Script"}
                        </button>
                        {s.recordingAvailable && (
                          <button type="button" className="btn btn-primary btn-sm" disabled={!consent.voiceAnalysis} onClick={() => void play("library", s)} data-testid="play">
                            Play through the module
                          </button>
                        )}
                      </div>
                      {openScript === s.id && (
                        <ol className="flex flex-col gap-1 border-t border-line bg-[#fbfaf7] px-3.5 py-3 text-sm" data-testid="script">
                          {s.script.map((t, i) => (
                            <li key={i} className="grid grid-cols-[4.5rem_1fr] gap-2">
                              <span className={`text-xs font-semibold uppercase tracking-wide ${t.speaker === "OPERATOR" ? "text-brand" : "text-[#7a4a00]"}`}>{t.speaker === "OPERATOR" ? "Operator" : "Caller"}</span>
                              <span>{t.text}</span>
                            </li>
                          ))}
                          {!s.recordingAvailable && (
                            <li className="mt-2 text-xs text-muted-foreground">
                              To record it: two team members read the lines like a call and save a PCM WAV as <span className="font-mono">demo/library/audio/{s.id}.wav</span> (see demo/library/README.md).
                            </li>
                          )}
                        </ol>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            </div>
          </>
        ) : (
          <section className="card flex flex-col overflow-hidden" aria-label="Call playback" data-testid="playback">
            <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-[#eef1f5] px-4 py-2.5">
              <div className="leading-tight">
                <p className="text-sm font-bold">
                  Helpline call (simulated) · {run.scenario ? <span className="font-mono">{run.scenario.id}</span> : (run.fileName ?? "upload")}
                </p>
                <p className="text-xs text-ink-2">
                  {run.scenario?.title ?? "Uploaded recording"} · {LANGUAGE_LABEL[run.language]}
                  {session && (
                    <>
                      {" "}
                      · <span className="font-mono">{session.docketNumber}</span>
                    </>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {session && !ended && !playing && (
                  <button type="button" className="btn btn-secondary btn-sm" onClick={endCall} data-testid="end">
                    End call
                  </button>
                )}
                <button type="button" className="btn btn-secondary btn-sm" onClick={back} disabled={playing}>
                  Back to library
                </button>
              </div>
            </header>

            <div className="flex flex-col gap-2 px-4 py-4">
              <div className="flex items-baseline justify-between text-xs text-ink-2">
                <span className="font-semibold">
                  {run.state === "starting" ? "Starting the call…" : run.state === "playing" ? "Sending windows to the module…" : run.state === "done" ? "All windows sent" : "Stopped"}
                </span>
                {run.total !== null && (
                  <span className="font-mono">
                    {run.windows.length}/{run.total} windows · {run.durationMs !== null ? clock(run.durationMs) : ""}
                  </span>
                )}
              </div>
              <div className="flex gap-[3px]" data-testid="window-strip" aria-hidden>
                {Array.from({ length: run.total ?? 0 }, (_, i) => {
                  const w = run.windows.find((x) => x.windowIndex === i);
                  const cls = !w ? (i === run.windows.length && run.state === "playing" ? "bg-[#9fb3cc] animate-pulse" : "bg-muted") : w.error ? "bg-danger" : w.analysed ? "bg-brand" : "bg-warn";
                  return <span key={i} className={`h-7 flex-1 rounded-[2px] ${cls}`} title={`${clock(i * 5000)}`} />;
                })}
              </div>
              <p className="flex flex-wrap gap-x-4 text-[0.7rem] text-muted-foreground">
                <span>
                  <span className="mr-1 inline-block size-2 rounded-[1px] bg-brand align-middle" />
                  analysed
                </span>
                <span>
                  <span className="mr-1 inline-block size-2 rounded-[1px] bg-warn align-middle" />
                  not analysed
                </span>
                <span>
                  <span className="mr-1 inline-block size-2 rounded-[1px] bg-danger align-middle" />
                  refused
                </span>
              </p>
              {run.error && (
                <p role="alert" className="border-l-[3px] border-danger bg-danger-soft px-3 py-2 text-sm">
                  {run.error}
                </p>
              )}
            </div>

            <div className="grid border-t border-line md:grid-cols-2">
              <div className="px-4 py-3 md:border-r md:border-line">
                <h3 className="section-title mb-2">Windows as sent</h3>
                <ol className="flex max-h-[26rem] flex-col gap-1.5 overflow-y-auto pr-1 text-sm" data-testid="window-rows">
                  {run.windows.map((w) => (
                    <li key={w.windowIndex} className="grid grid-cols-[3.75rem_1fr] gap-2">
                      <span className="font-mono text-xs text-muted-foreground">
                        {clock(w.startMs)}
                        <span className="block">{seconds(w.call.ms)}</span>
                      </span>
                      <span className={w.error ? "text-danger" : ""}>{w.error ? `Refused: ${w.error}` : w.transcript ? w.transcript : <span className="text-muted-foreground">(no caller speech)</span>}</span>
                    </li>
                  ))}
                  {run.windows.length === 0 && <li className="text-muted-foreground">Waiting for the first window…</li>}
                </ol>
                <p className="mt-2 text-xs text-muted-foreground">The text shown per window is the caller&apos;s words only, as returned by the module.</p>
              </div>
              <div className="px-4 py-3">
                <h3 className="section-title mb-2">Transcript, by speaker</h3>
                <ol className="flex max-h-[26rem] flex-col gap-1.5 overflow-y-auto pr-1 text-sm" data-testid="speaker-transcript">
                  {transcript.map((m) => (
                    <li key={m.id} className="grid grid-cols-[4.25rem_1fr] gap-2">
                      <span className={`text-[0.7rem] font-semibold uppercase tracking-wide ${m.sender === "OPERATOR" ? "text-brand" : "text-[#7a4a00]"}`}>{m.sender === "OPERATOR" ? "Operator" : "Caller"}</span>
                      <span>{m.text}</span>
                    </li>
                  ))}
                  {transcript.length === 0 && <li className="text-muted-foreground">Appears as windows are analysed.</li>}
                </ol>
                <p className="mt-2 text-xs text-muted-foreground">Operator lines are stored as questions and never scored.</p>
              </div>
            </div>
          </section>
        )}
      </div>

      <div className="xl:sticky xl:top-4">
        <ResultsPanel
          live={!!session && !ended}
          onRefresh={session ? () => void refresh() : undefined}
          summary={{
            mode: run?.source === "upload" ? "Recorded audio (upload)" : "Recorded audio library",
            inputMethod: "RECORDED_AUDIO",
            channel: session?.channel ?? "VOICE_CALL",
            language: run?.language ?? "en",
            scenarioId: run?.scenario?.id ?? null,
            docketNumber: session?.docketNumber ?? null,
            interactionId: session?.interactionId ?? null,
            caseId: session?.caseId ?? null,
          }}
          results={results}
          timeline={timeline}
          expected={run?.scenario?.expected ?? null}
        />
      </div>
    </div>
  );
}
