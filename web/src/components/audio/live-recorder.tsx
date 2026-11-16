"use client";

/**
 * Live microphone recorder (task 7.1, FR-CH-03, C-TEC-04, NFR-REL-02). Kept for the demo input
 * layer (task M.12); not used by any page yet. It knows nothing about the module's API: the
 * caller passes `send`, which delivers one window (the demo relays it server-side with its own
 * API key, so no key ever reaches the browser) and returns the HTTP response.
 *
 * Records in 5-second windows. Each window is a complete, separately decodable file
 * (the recorder is restarted every 5 s, because MediaRecorder timeslices after the
 * first are not playable on their own). Windows upload in order with retries.
 * A clear recording indicator is always visible, with Mute and Stop.
 * If the microphone is refused, voice consent is missing, or voice analysis keeps
 * failing, it stops and calls `onFallback`. Nothing about risk is shown except the
 * emergency options (CLAUDE.md rule 1).
 */
import { useEffect, useRef, useState } from "react";
import type { EmergencyPanel } from "@/contracts/interaction";

const WINDOW_MS = 5_000;
const RETRIES = [500, 1_500];
/** Two windows in a row that could not be analysed: switch to typing (NFR-REL-02). */
const MAX_UNANALYSED = 2;

interface AudioReply {
  windowIndex: number;
  transcript: string | null;
  analysed: boolean;
  showEmergencyPanel: boolean;
  emergency: EmergencyPanel | null;
}

/** windowIndex and the call clock must be unique across the whole interaction, not one recording. */
function clockFor(id: string): { nextIndex: () => number; offsetMs: () => number } {
  const key = `nhaa-voice-${id}`;
  let state = { next: 0, t0: Date.now() };
  try {
    const raw = sessionStorage.getItem(key);
    if (raw) state = JSON.parse(raw) as typeof state;
  } catch {
    /* private mode: memory only */
  }
  const save = () => {
    try {
      sessionStorage.setItem(key, JSON.stringify(state));
    } catch {
      /* ignore */
    }
  };
  save();
  return {
    nextIndex: () => {
      const i = state.next++;
      save();
      return i;
    },
    offsetMs: () => Date.now() - state.t0,
  };
}

function pickMime(): string {
  for (const m of ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/webm"]) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m)) return m;
  }
  return "";
}

export interface RecorderLabels {
  speak: string;
  recording: string;
  muted: string;
  sending: string;
  heard: string;
  mute: string;
  unmute: string;
  stop: string;
}

const ENGLISH: RecorderLabels = {
  speak: "Start speaking",
  recording: "Recording",
  muted: "Muted",
  sending: "Sending…",
  heard: "What we heard",
  mute: "Mute",
  unmute: "Unmute",
  stop: "Stop",
};

export function LiveRecorder({
  interactionId,
  send,
  onEmergency,
  onFinished,
  onFallback,
  labels = ENGLISH,
}: {
  /** Used only to keep window numbers unique across recordings of one interaction. */
  interactionId: string;
  /** Delivers one window (fields `audio`, `windowIndex`, `startMs`); null on network failure. */
  send: (form: FormData) => Promise<Response | null>;
  onEmergency: (panel: EmergencyPanel) => void;
  onFinished: () => Promise<void>;
  onFallback: (reason: "micRefused" | "unavailable" | "needsConsent") => void;
  labels?: RecorderLabels;
}) {
  const t = (k: keyof RecorderLabels) => labels[k];
  const [phase, setPhase] = useState<"idle" | "recording" | "finishing">("idle");
  const [muted, setMuted] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [heard, setHeard] = useState<string[]>([]);

  const stream = useRef<MediaStream | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const running = useRef(false);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const unanalysed = useRef(0);
  const clock = useRef<ReturnType<typeof clockFor> | null>(null);
  const timers = useRef<number[]>([]);

  useEffect(
    () => () => {
      running.current = false;
      timers.current.forEach((x) => clearTimeout(x));
      stream.current?.getTracks().forEach((tr) => tr.stop());
    },
    [],
  );

  function release() {
    running.current = false;
    timers.current.forEach((x) => clearTimeout(x));
    timers.current = [];
    stream.current?.getTracks().forEach((tr) => tr.stop());
    stream.current = null;
  }

  async function upload(blob: Blob, windowIndex: number, startMs: number): Promise<void> {
    const form = new FormData();
    form.append("audio", blob, `w${windowIndex}.webm`);
    form.append("windowIndex", String(windowIndex));
    form.append("startMs", String(startMs));
    for (let attempt = 0; ; attempt++) {
      const res = await send(form).catch(() => null);
      if (res?.status === 202) {
        const r = (await res.json()) as AudioReply;
        if (r.transcript) setHeard((h) => [...h, r.transcript!]);
        if (r.showEmergencyPanel && r.emergency) onEmergency(r.emergency);
        unanalysed.current = r.analysed ? 0 : unanalysed.current + 1;
        if (unanalysed.current >= MAX_UNANALYSED) {
          release();
          setPhase("idle");
          onFallback("unavailable");
        }
        return;
      }
      if (res?.status === 409) {
        release();
        setPhase("idle");
        onFallback("needsConsent");
        return;
      }
      if (attempt >= RETRIES.length || (res && res.status >= 400 && res.status < 500 && res.status !== 429)) {
        unanalysed.current += 1;
        if (unanalysed.current >= MAX_UNANALYSED) {
          release();
          setPhase("idle");
          onFallback("unavailable");
        }
        return;
      }
      await new Promise((r) => setTimeout(r, RETRIES[attempt]));
    }
  }

  function recordWindow(mime: string) {
    if (!running.current || !stream.current) return;
    const rec = new MediaRecorder(stream.current, mime ? { mimeType: mime } : undefined);
    recorder.current = rec;
    const parts: Blob[] = [];
    const startMs = clock.current!.offsetMs();
    rec.ondataavailable = (e) => {
      if (e.data.size) parts.push(e.data);
    };
    rec.onstop = () => {
      const blob = new Blob(parts, { type: rec.mimeType || mime || "audio/webm" });
      if (blob.size > 0) {
        const idx = clock.current!.nextIndex();
        queue.current = queue.current.then(() => upload(blob, idx, startMs)); // in order
      }
      if (running.current) recordWindow(mime); // next window straight away
    };
    rec.start();
    timers.current.push(window.setTimeout(() => rec.state === "recording" && rec.stop(), WINDOW_MS));
  }

  async function start() {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      onFallback("micRefused");
      return;
    }
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
    } catch {
      onFallback("micRefused"); // refused or no microphone: switch to text (C-TEC-04)
      return;
    }
    clock.current = clockFor(interactionId);
    unanalysed.current = 0;
    running.current = true;
    setHeard([]);
    setElapsed(0);
    setPhase("recording");
    const t0 = Date.now();
    const tick = () => {
      if (!running.current) return;
      setElapsed(Math.floor((Date.now() - t0) / 1000));
      timers.current.push(window.setTimeout(tick, 1000));
    };
    tick();
    recordWindow(pickMime());
  }

  function toggleMute() {
    const next = !muted;
    stream.current?.getAudioTracks().forEach((tr) => (tr.enabled = !next));
    setMuted(next);
  }

  async function stop() {
    setPhase("finishing");
    running.current = false;
    const rec = recorder.current;
    if (rec && rec.state === "recording") {
      await new Promise<void>((resolve) => {
        rec.addEventListener("stop", () => resolve(), { once: true });
        rec.stop();
      });
    }
    release();
    await queue.current; // every window is analysed before moving on
    await onFinished();
    setPhase("idle");
  }

  if (phase === "idle") {
    return (
      <button type="button" onClick={start} className="btn btn-secondary btn-lg border-brand text-ink" data-testid="voice-start">
        🎤 {t("speak")}
      </button>
    );
  }

  return (
    <div className="card flex flex-col gap-3 border-l-[6px] border-l-danger p-4" data-testid="voice-recorder">
      <p role="status" aria-live="polite" className="flex items-center gap-2 text-lg font-semibold">
        <span aria-hidden className={`inline-block size-3 rounded-[2px] ${muted ? "bg-muted-foreground" : "animate-pulse bg-danger"}`} />
        {phase === "finishing" ? t("sending") : muted ? t("muted") : t("recording")}
        <span className="font-mono text-base">
          {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")}
        </span>
      </p>
      {heard.length > 0 && (
        <div className="text-base">
          <p className="section-title">{t("heard")}</p>
          <p data-testid="voice-heard">{heard.join(" ")}</p>
        </div>
      )}
      <div className="flex gap-3">
        <button type="button" onClick={toggleMute} disabled={phase !== "recording"} className="btn btn-secondary min-h-12 flex-1 text-lg">
          {muted ? t("unmute") : t("mute")}
        </button>
        <button type="button" onClick={stop} disabled={phase !== "recording"} className="btn btn-primary min-h-12 flex-1 text-lg" data-testid="voice-stop">
          {t("stop")}
        </button>
      </div>
    </div>
  );
}
