/**
 * Voice window → dimension signals (task 7.5, FR-VOI-03/05/06/08, Appendix A "Voice / acoustic").
 * Pure: no database, no network, no clock.
 *
 * Voice is supporting evidence, not proof (FR-VOI-08):
 *  - every signal here is source VOICE, which has the lowest weight (0.15);
 *  - scores and confidences are kept moderate (confidence ≤ MAX_CONFIDENCE);
 *  - voice never carries a safety-override flag, and fuse() caps voice-only
 *    dimensions at 0.6, so voice alone can never reach Critical (AC-VOI-05).
 *
 * The mapping is a project default (the requirements name the cues, not the numbers);
 * it is listed for review with the other scoring choices.
 */
import type { Dimension } from "./types";

export type VoiceEmotionLabel = "fear" | "sadness" | "anger" | "neutral" | "flat" | "happy" | "other";

export interface VoiceWindowInput {
  emotion?: { label: string; confidence: number } | null;
  /** z-scores against the speaker's own baseline (null until the baseline is set) */
  baselineDeviation?: { pitchStdZ?: number | null; speechRateZ?: number | null; silenceRatioZ?: number | null; energyZ?: number | null } | null;
  events?: readonly { type: string; confidence: number }[];
}

export interface VoiceSignal {
  dimension: Dimension;
  score: number;
  confidence: number;
  /** Staff-facing label: what was heard, not a diagnosis */
  label: string;
  cue: string;
}

/** A deviation counts once it is this many baseline spreads away (FR-VOI-03 "unusually"). */
export const DEVIATION_Z = 1.5;
export const MAX_CONFIDENCE = 0.7;
/** Below this the emotion model is too unsure to use. */
export const MIN_EMOTION_CONFIDENCE = 0.4;

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const round = (x: number) => Math.round(x * 100) / 100;

/** "low variation" / "high variation" / null, from the pitch-spread deviation (AC-VOI-02). */
export function pitchVariationFlag(pitchStdZ: number | null | undefined): "low variation" | "high variation" | null {
  if (pitchStdZ === null || pitchStdZ === undefined) return null;
  if (pitchStdZ <= -DEVIATION_Z) return "low variation";
  if (pitchStdZ >= DEVIATION_Z) return "high variation";
  return null;
}

/** Strength of a deviation beyond the threshold, 0.3 at the threshold rising to 0.6. */
const fromZ = (z: number) => clamp01(0.3 + 0.1 * (Math.abs(z) - DEVIATION_Z));

export function voiceSignals(w: VoiceWindowInput): VoiceSignal[] {
  const out: VoiceSignal[] = [];
  const push = (s: VoiceSignal) => out.push({ ...s, score: round(Math.min(s.score, 0.6)), confidence: round(Math.min(s.confidence, MAX_CONFIDENCE)) });

  const e = w.emotion;
  if (e && e.confidence >= MIN_EMOTION_CONFIDENCE) {
    const c = e.confidence;
    if (e.label === "fear") push({ dimension: "FEAR_ANXIETY", score: 0.6 * c, confidence: c, label: "Voice sounds fearful", cue: "emotion:fear" });
    if (e.label === "sadness") push({ dimension: "DEPRESSION", score: 0.5 * c, confidence: c, label: "Voice sounds sad", cue: "emotion:sadness" });
    if (e.label === "flat") push({ dimension: "DEPRESSION", score: 0.5 * c, confidence: c, label: "Voice sounds flat", cue: "emotion:flat" });
    if (e.label === "anger") push({ dimension: "ACUTE_STRESS", score: 0.4 * c, confidence: c, label: "Voice sounds agitated", cue: "emotion:anger" });
  }

  const d = w.baselineDeviation;
  const pitch = pitchVariationFlag(d?.pitchStdZ);
  if (pitch === "low variation") push({ dimension: "DEPRESSION", score: fromZ(d!.pitchStdZ!), confidence: 0.5, label: "Flatter voice than at the start of the call", cue: "pitch:flat" });
  if (pitch === "high variation") push({ dimension: "FEAR_ANXIETY", score: fromZ(d!.pitchStdZ!), confidence: 0.5, label: "Unsteady pitch compared with the start of the call", cue: "pitch:unstable" });
  if (d?.speechRateZ != null && d.speechRateZ >= DEVIATION_Z)
    push({ dimension: "ACUTE_STRESS", score: fromZ(d.speechRateZ), confidence: 0.45, label: "Speaking much faster than at the start", cue: "rate:fast" });
  if (d?.speechRateZ != null && d.speechRateZ <= -DEVIATION_Z)
    push({ dimension: "DEPRESSION", score: fromZ(d.speechRateZ), confidence: 0.4, label: "Speaking much slower than at the start", cue: "rate:slow" });
  if (d?.silenceRatioZ != null && d.silenceRatioZ >= DEVIATION_Z)
    push({ dimension: "ACUTE_STRESS", score: fromZ(d.silenceRatioZ), confidence: 0.4, label: "Many more pauses than at the start", cue: "pauses:more" });

  for (const ev of w.events ?? []) {
    if (ev.confidence < MIN_EMOTION_CONFIDENCE) continue;
    if (ev.type === "SOBBING" || ev.type === "CRYING")
      push({ dimension: "SEVERE_TRAUMA", score: 0.5 * ev.confidence, confidence: ev.confidence, label: "Crying or sobbing heard", cue: `event:${ev.type.toLowerCase()}` });
    if (ev.type === "LONG_SILENCE")
      push({ dimension: "ACUTE_STRESS", score: 0.3, confidence: 0.4 * ev.confidence + 0.2, label: "Long silence after a question", cue: "event:long_silence" });
  }
  return out;
}

/**
 * FR-EMO-02: fuse text and voice emotion, weighting each by its confidence.
 * Returns one distribution over the union of labels plus the top label.
 */
export function fuseEmotion(
  text: { label: string; confidence: number } | null | undefined,
  voice: { label: string; confidence: number; distribution?: Record<string, number> | null } | null | undefined,
): { label: string; confidence: number; distribution: Record<string, number> } | null {
  const parts: { dist: Record<string, number>; w: number }[] = [];
  if (text && text.confidence > 0) parts.push({ dist: { [text.label]: 1 }, w: text.confidence });
  if (voice && voice.confidence > 0) {
    const dist = voice.distribution && Object.keys(voice.distribution).length ? voice.distribution : { [voice.label]: 1 };
    parts.push({ dist, w: voice.confidence });
  }
  if (!parts.length) return null;
  const total = parts.reduce((s, p) => s + p.w, 0);
  const merged: Record<string, number> = {};
  for (const p of parts) {
    const sum = Object.values(p.dist).reduce((s, v) => s + v, 0) || 1;
    for (const [k, v] of Object.entries(p.dist)) merged[k] = (merged[k] ?? 0) + (p.w / total) * (v / sum);
  }
  const [label, confidence] = Object.entries(merged).sort((a, b) => b[1] - a[1])[0]!;
  const distribution = Object.fromEntries(Object.entries(merged).map(([k, v]) => [k, round(v)]));
  return { label, confidence: round(confidence), distribution };
}
