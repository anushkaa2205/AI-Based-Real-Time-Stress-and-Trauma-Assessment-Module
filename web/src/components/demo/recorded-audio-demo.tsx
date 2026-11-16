"use client";

/**
 * Demo input 3, play a recording (tasks M.8, M.14, N.7; NIVARA_FLOW_AND_UI_PLAN.md §6.3). A library
 * recording or an uploaded WAV is cut into 5-second windows on the server and sent through the real
 * audio path with the demo key. The page shows a progress bar ("sending 7 of 24") and nothing about
 * the assessment (rule 1). Expected labels never reach this page.
 */
import { FileAudio2, Upload } from "lucide-react";
import { useRef, useState, type FormEvent } from "react";
import type { RecordingEvent } from "@/contracts/demo";
import type { VictimLang } from "@/contracts/interaction";
import { ConsentFields, DEFAULT_DISTRICT, DistrictSelect, FULL_CONSENT, LanguageSelect, type DemoConsent, type DistrictOption } from "./consent-fields";
import { DemoShell } from "./demo-shell";
import { EmergencyPanel } from "./emergency-panel";
import { ErrorLine } from "./live-text-demo";
import { Registered } from "./registered";
import { DEMO_ERRORS, useDemoCase } from "./use-demo-case";

export interface RecordedScenario {
  id: string;
  title: string;
  languageTag: string;
  language: VictimLang;
  recordingAvailable: boolean;
}

interface Progress {
  windows: number;
  sent: number;
  analysed: number;
  failed: number;
  done: boolean;
}

const TITLE = "Play a recording";
const LEAD = "Send a recorded call through the real audio path. The server cuts it into five-second windows; you get a docket ID at the end.";

export function RecordedAudioDemo({ scenarios, districts }: { scenarios: RecordedScenario[]; districts: DistrictOption[] }) {
  const demo = useDemoCase();
  const recorded = scenarios.filter((s) => s.recordingAvailable);
  const [source, setSource] = useState<"library" | "upload">(recorded.length ? "library" : "upload");
  const [scenarioId, setScenarioId] = useState(recorded[0]?.id ?? "");
  const [language, setLanguage] = useState<VictimLang>("en");
  const [district, setDistrict] = useState(districts.some((d) => d.code === DEFAULT_DISTRICT) ? DEFAULT_DISTRICT : (districts[0]?.code ?? ""));
  const [consent, setConsent] = useState<DemoConsent>(FULL_CONSENT);
  const [audioSource, setAudioSource] = useState<"MIXED" | "CALLER_ONLY">("MIXED");
  const [firstSpeaker, setFirstSpeaker] = useState<"OPERATOR" | "CALLER">("OPERATOR");
  const [progress, setProgress] = useState<Progress | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const scenario = recorded.find((s) => s.id === scenarioId) ?? null;

  async function start(e: FormEvent) {
    e.preventDefault();
    const lang = source === "library" && scenario ? scenario.language : language;
    setLanguage(lang);
    const ok = await demo.start({ mode: "RECORDED_AUDIO", language: lang, districtCode: district, consent, scenarioId: source === "library" ? scenario?.id : undefined });
    if (ok) setProgress(null);
  }

  /** Sends the recording; a request that runs out of its hosting time answers `more`, and we send again from `nextWindow`. */
  async function play() {
    if (!demo.interactionId) return;
    const file = source === "upload" ? fileRef.current?.files?.[0] : undefined;
    if (source === "upload" && !file) return demo.setError("Choose a WAV file first.");
    demo.setError(null);
    setProgress({ windows: 0, sent: 0, analysed: 0, failed: 0, done: false });
    let fromWindow = 0;
    for (let part = 0; part < 60; part++) {
      let init: RequestInit;
      if (source === "library") {
        init = { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scenarioId, fromWindow }) };
      } else {
        const form = new FormData();
        form.set("file", file!, file!.name);
        form.set("audioSource", audioSource);
        form.set("firstSpeaker", firstSpeaker);
        form.set("fromWindow", String(fromWindow));
        init = { method: "POST", body: form };
      }
      const res = await fetch(`/api/demo/interactions/${demo.interactionId}/recording`, { ...init, credentials: "same-origin" }).catch(() => null);
      if (!res?.ok || !res.body) {
        const code = res ? ((await res.json().catch(() => null)) as { code?: string } | null)?.code : null;
        setProgress(null);
        return demo.setError((code && DEMO_ERRORS[code]) ?? "The recording could not be sent.");
      }
      const next = await readStream(res.body);
      if (next === null) return; // done or failed
      fromWindow = next;
    }
  }

  /** Reads one NDJSON response; returns the window to continue from, or null when the recording is finished. */
  async function readStream(body: ReadableStream<Uint8Array>): Promise<number | null> {
    const reader = body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    let next: number | null = null;
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const parts = buf.split("\n");
      buf = parts.pop() ?? "";
      for (const line of parts) {
        if (!line.trim()) continue;
        const ev = JSON.parse(line) as RecordingEvent;
        if (ev.type === "start") setProgress((p) => ({ ...(p ?? { sent: 0, analysed: 0, failed: 0 }), windows: ev.windows, done: false }));
        else if (ev.type === "window") setProgress((p) => p && { ...p, sent: p.sent + 1, analysed: p.analysed + (ev.analysed ? 1 : 0), failed: p.failed + (ev.error ? 1 : 0) });
        else if (ev.type === "more") next = ev.nextWindow;
        else if (ev.type === "done") {
          setProgress((p) => p && { ...p, done: true });
          if (ev.showEmergencyPanel && ev.emergency) demo.receipt({ ok: true, showEmergencyPanel: true, emergency: ev.emergency });
        } else if (ev.type === "error") demo.setError(ev.message);
      }
    }
    return next;
  }

  function another() {
    demo.reset();
    setProgress(null);
  }

  const shell = (children: React.ReactNode) => (
    <DemoShell title={TITLE} lead={LEAD} phase={demo.phase}>
      {children}
    </DemoShell>
  );

  if (demo.phase === "registered" && demo.docketNumber) return shell(<Registered docketNumber={demo.docketNumber} onAnother={another} />);

  if (demo.phase === "consent") {
    return shell(
      <form onSubmit={start} className="card card-pad flex flex-col gap-5" data-testid="consent-step">
        <div role="radiogroup" aria-label="Recording source" className="grid gap-2 sm:grid-cols-2">
          {(
            [
              ["library", "A library recording", "A team recording of a synthetic script", recorded.length > 0],
              ["upload", "Upload a WAV", "16-bit PCM WAV, up to 4 MB (about two minutes)", true],
            ] as const
          ).map(([key, label, hint, enabled]) => (
            <label key={key} className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 ${source === key ? "border-brand bg-brand-soft/40" : "border-line"} ${enabled ? "" : "opacity-50"}`}>
              <input type="radio" name="source" className="mt-1 accent-brand" checked={source === key} disabled={!enabled} onChange={() => setSource(key)} />
              <span>
                <span className="block font-medium text-ink">{label}</span>
                <span className="block text-xs text-ink-3">{enabled ? hint : "No library recordings on this server yet"}</span>
              </span>
            </label>
          ))}
        </div>
        {source === "library" ? (
          <label htmlFor="scenario" className="flex flex-col">
            <span className="label">Recording</span>
            <select id="scenario" className="field" value={scenarioId} onChange={(e) => setScenarioId(e.target.value)} data-testid="scenario">
              {recorded.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.id} · {s.title} ({s.languageTag})
                </option>
              ))}
            </select>
          </label>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col sm:col-span-2">
              <span className="label">WAV file</span>
              <input ref={fileRef} type="file" accept=".wav,audio/wav,audio/x-wav" className="field file:mr-3 file:rounded-md file:border-0 file:bg-brand-soft file:px-3 file:py-1 file:text-sm file:font-medium file:text-brand-deep" data-testid="file" />
            </label>
            <label className="flex flex-col">
              <span className="label">Voices on the track</span>
              <select className="field" value={audioSource} onChange={(e) => setAudioSource(e.target.value as typeof audioSource)}>
                <option value="MIXED">Operator and caller (mixed)</option>
                <option value="CALLER_ONLY">Caller only</option>
              </select>
            </label>
            <label className="flex flex-col">
              <span className="label">Who speaks first</span>
              <select className="field" value={firstSpeaker} disabled={audioSource === "CALLER_ONLY"} onChange={(e) => setFirstSpeaker(e.target.value as typeof firstSpeaker)}>
                <option value="OPERATOR">The operator</option>
                <option value="CALLER">The caller</option>
              </select>
            </label>
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <LanguageSelect value={language} onChange={setLanguage} disabled={source === "library"} />
          <DistrictSelect districts={districts} value={district} onChange={setDistrict} />
        </div>
        <ConsentFields value={consent} onChange={setConsent} need="voiceAnalysis" />
        {demo.error && <ErrorLine text={demo.error} />}
        <button type="submit" disabled={demo.busy || !district || !consent.voiceAnalysis || (source === "library" && !scenario)} className="btn btn-primary btn-lg" data-testid="start">
          {demo.busy ? "Starting…" : "Continue"}
        </button>
      </form>,
    );
  }

  const pct = progress && progress.windows ? Math.round((progress.sent / progress.windows) * 100) : 0;
  return shell(
    <div className="flex flex-col gap-4">
      {demo.emergency && <EmergencyPanel panel={demo.emergency} />}
      <section className="card card-pad flex flex-col gap-4" aria-label="Recording">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-lg bg-brand-soft text-brand" aria-hidden>
            {source === "library" ? <FileAudio2 className="size-5" /> : <Upload className="size-5" />}
          </span>
          <div className="min-w-0">
            <p className="font-semibold text-ink">{source === "library" && scenario ? `${scenario.id} · ${scenario.title}` : (fileRef.current?.files?.[0]?.name ?? "Your WAV file")}</p>
            <p className="hint">Sent as 5-second windows through the real audio path.</p>
          </div>
        </div>
        {!progress ? (
          <button type="button" onClick={() => void play()} className="btn btn-primary btn-lg" data-testid="play">
            Send the recording
          </button>
        ) : (
          <div className="flex flex-col gap-2" aria-live="polite">
            <div className="h-2.5 overflow-hidden rounded-full bg-surface-2">
              <div className="h-full rounded-full bg-brand transition-[width] duration-300" style={{ width: `${pct}%` }} />
            </div>
            <p className="num text-sm text-ink-2" data-testid="progress">
              {progress.done ? `Sent ${progress.sent} of ${progress.windows} windows` : progress.windows ? `Sending ${Math.min(progress.sent + 1, progress.windows)} of ${progress.windows}…` : "Preparing…"}
              {progress.failed > 0 && <span className="text-warn"> · {progress.failed} not analysed</span>}
            </p>
          </div>
        )}
        {demo.error && <ErrorLine text={demo.error} />}
      </section>
      <div className="flex items-center justify-between gap-3 border-t border-line pt-4">
        <p className="hint">When the recording has been sent, register the case to get a docket ID.</p>
        <button type="button" onClick={() => void demo.finish()} disabled={!progress?.done || demo.phase !== "input"} className="btn btn-primary" data-testid="finish">
          {demo.phase === "finishing" ? "Registering…" : "Finish and register"}
        </button>
      </div>
    </div>,
  );
}
