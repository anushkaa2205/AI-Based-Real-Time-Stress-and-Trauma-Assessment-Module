"use client";

/**
 * Live microphone recorder (task 7.1, FR-CH-03, C-TEC-04, NFR-REL-02), used by the portal's Speak
 * conversation (tasks M.12, N.7, P.7). It knows nothing about the module's API: the caller passes
 * `send`, which delivers one window (the portal relays it server-side with its own API key, so no key
 * ever reaches the browser) and returns the HTTP response; `onReply` receives each window's reply
 * (since Phase P it carries the person's own heard words for "We heard"). It shows nothing about the
 * assessment, only the emergency options (CLAUDE.md rule 1).
 *
 * Phase P, turn by turn: the person taps to speak, then Done. `windowIndex` and `startMs` continue
 * across turns, and `startMs` counts speech only (not the time spent reading a question), so the
 * three-minute cap is a cap on speech (`maxTotalMs`).
 *
 * Records in 5-second windows. Each window is a complete, separately decodable file
 * (the recorder is restarted every 5 s, because MediaRecorder timeslices after the
 * first are not playable on their own). Windows upload in order with retries.
 * A clear recording indicator is always visible, with Mute and Stop.
 * If the microphone is refused, voice consent is missing, or voice analysis keeps
 * failing, it stops and calls `onFallback`. Nothing about risk is shown except the
 * emergency options (CLAUDE.md rule 1).
 */
import { Mic, MicOff, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { EmergencyPanel } from "@/contracts/interaction";

const WINDOW_MS = 5_000;
const RETRIES = [500, 1_500];
/** Two windows in a row that could not be analysed: switch to typing (NFR-REL-02). */
const MAX_UNANALYSED = 2;

interface AudioReply {
  analysed: boolean;
  showEmergencyPanel: boolean;
  emergency: EmergencyPanel | null;
}

/**
 * windowIndex and the speech clock must be unique across the whole interaction, not one recording.
 * Held in memory only (the conversation is too): a reload starts a new conversation anyway.
 */
const clocks = new Map<string, { next: number; spokenMs: number }>();
function clockFor(id: string) {
  let state = clocks.get(id);
  if (!state) {
    state = { next: 0, spokenMs: 0 };
    clocks.set(id, state);
  }
  const s = state;
  return {
    nextIndex: () => s.next++,
    /** Speech sent so far in this interaction, in ms */
    spokenMs: () => s.spokenMs,
    addSpoken: (ms: number) => {
      s.spokenMs += Math.max(0, ms);
    },
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
  mute: string;
  unmute: string;
  stop: string;
}

const ENGLISH: RecorderLabels = {
  speak: "Start speaking",
  recording: "Recording",
  muted: "Muted",
  sending: "Sending…",
  mute: "Mute",
  unmute: "Unmute",
  stop: "Stop",
};

export function LiveRecorder({
  interactionId,
  send,
  onEmergency,
  onReply,
  onFinished,
  onFallback,
  labels = ENGLISH,
  maxTotalMs,
}: {
  /** Keeps window numbers and the speech clock unique across the turns of one interaction. */
  interactionId: string;
  /** Delivers one window (fields `audio`, `windowIndex`, `startMs`); null on network failure. */
  send: (form: FormData) => Promise<Response | null>;
  onEmergency: (panel: EmergencyPanel) => void;
  /** Each window's reply as the relay sent it */
  onReply?: (reply: unknown) => void;
  onFinished: () => Promise<void>;
  onFallback: (reason: "micRefused" | "unavailable" | "needsConsent" | "ended") => void;
  labels?: RecorderLabels;
  /** Stops by itself once this much speech has been sent in the interaction (the portal caps it at three minutes). */
  maxTotalMs?: number;
}) {
  const t = (k: keyof RecorderLabels) => labels[k];
  const [phase, setPhase] = useState<"idle" | "recording" | "finishing">("idle");
  const [muted, setMuted] = useState(false);
  const [elapsed, setElapsed] = useState(0);

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
      if (res?.status === 202 || res?.status === 200) {
        const r = (await res.json()) as AudioReply;
        onReply?.(r);
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
        const code = ((await res.json().catch(() => null)) as { code?: string } | null)?.code;
        release();
        setPhase("idle");
        onFallback(code === "INTERACTION_ENDED" ? "ended" : "needsConsent");
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
    const startMs = clock.current!.spokenMs();
    const began = Date.now();
    rec.ondataavailable = (e) => {
      if (e.data.size) parts.push(e.data);
    };
    rec.onstop = () => {
      clock.current!.addSpoken(Math.min(WINDOW_MS, Date.now() - began));
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
    if (maxTotalMs && clock.current.spokenMs() >= maxTotalMs) {
      stream.current.getTracks().forEach((tr) => tr.stop());
      stream.current = null;
      onFallback("ended");
      return;
    }
    unanalysed.current = 0;
    running.current = true;
    const before = clock.current.spokenMs();
    setElapsed(Math.floor(before / 1000));
    setPhase("recording");
    const t0 = Date.now();
    const tick = () => {
      if (!running.current) return;
      const total = before + (Date.now() - t0);
      setElapsed(Math.floor(total / 1000));
      if (maxTotalMs && total >= maxTotalMs) {
        void stop();
        return;
      }
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
      <button type="button" onClick={start} className="btn btn-primary btn-lg w-full sm:w-auto" data-testid="voice-start">
        <Mic className="size-5" aria-hidden /> {t("speak")}
      </button>
    );
  }

  const mm = Math.floor(elapsed / 60);
  const ss = String(elapsed % 60).padStart(2, "0");
  return (
    <div className="card flex flex-col items-center gap-5 p-6" data-testid="voice-recorder">
      <span className={`grid size-20 place-items-center rounded-full ${muted ? "bg-surface-2 text-ink-3" : "listening bg-brand text-white"}`} aria-hidden>
        {muted ? <MicOff className="size-8" /> : <Mic className="size-8" />}
      </span>
      <p role="status" aria-live="polite" className="flex flex-col items-center gap-1">
        <span className="text-lg font-semibold">{phase === "finishing" ? t("sending") : muted ? t("muted") : t("recording")}</span>
        <span className="num text-2xl text-ink-2">
          {mm}:{ss}
          {maxTotalMs ? <span className="text-sm text-ink-3"> / {Math.floor(maxTotalMs / 60_000)}:00</span> : null}
        </span>
      </p>
      <div className="flex w-full gap-3 sm:w-auto">
        <button type="button" onClick={toggleMute} disabled={phase !== "recording"} className="btn btn-secondary min-h-12 flex-1 px-6">
          {muted ? <Mic className="size-4" aria-hidden /> : <MicOff className="size-4" aria-hidden />} {muted ? t("unmute") : t("mute")}
        </button>
        <button type="button" onClick={stop} disabled={phase !== "recording"} className="btn btn-primary min-h-12 flex-1 px-6" data-testid="voice-stop">
          <Square className="size-4" aria-hidden /> {t("stop")}
        </button>
      </div>
    </div>
  );
}
