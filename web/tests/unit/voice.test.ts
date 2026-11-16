/** Voice → scoring signals, emotion fusion, operator suggestions (tasks 7.3–7.5, 7.7; AC-VOI-02/05, AC-EMO-01). */
import { describe, expect, it } from "vitest";
import { VICTIM_LANGS } from "@/contracts/interaction";
import { hasKey } from "@/core/i18n/messages";
import { suggestQuestions } from "@/core/operator/suggest";
import { assess } from "@/core/scoring/assess";
import { DEFAULT_CONFIG } from "@/core/scoring/defaultConfig";
import type { IndicatorInput } from "@/core/scoring/types";
import { MAX_CONFIDENCE, fuseEmotion, pitchVariationFlag, voiceSignals, type VoiceWindowInput } from "@/core/scoring/voice";
import { DIMENSIONS } from "@/models/enums";

/** The most alarming voice window we can construct. */
const WORST: VoiceWindowInput = {
  emotion: { label: "fear", confidence: 1 },
  baselineDeviation: { pitchStdZ: 9, speechRateZ: 9, silenceRatioZ: 9, energyZ: 9 },
  events: [
    { type: "SOBBING", confidence: 1 },
    { type: "LONG_SILENCE", confidence: 1 },
  ],
};

describe("pitchVariationFlag (AC-VOI-02)", () => {
  it("flags flat and unstable pitch relative to the speaker's own baseline", () => {
    expect(pitchVariationFlag(-2)).toBe("low variation");
    expect(pitchVariationFlag(2)).toBe("high variation");
    expect(pitchVariationFlag(0.4)).toBeNull();
    expect(pitchVariationFlag(null)).toBeNull();
  });
});

describe("voiceSignals (FR-VOI-03/05/06/08)", () => {
  it("is supporting evidence only: moderate scores, capped confidence, no override flags", () => {
    const sigs = voiceSignals(WORST);
    expect(sigs.length).toBeGreaterThan(3);
    for (const s of sigs) {
      expect(s.score).toBeLessThanOrEqual(0.6);
      expect(s.confidence).toBeLessThanOrEqual(MAX_CONFIDENCE);
      expect(s).not.toHaveProperty("flags");
      expect(s.label).not.toMatch(/svi|score|diagnos/i);
    }
  });
  it("maps cues to dimensions", () => {
    const dims = (w: VoiceWindowInput) => voiceSignals(w).map((s) => s.dimension);
    expect(dims({ emotion: { label: "fear", confidence: 0.8 } })).toEqual(["FEAR_ANXIETY"]);
    expect(dims({ emotion: { label: "sadness", confidence: 0.8 } })).toEqual(["DEPRESSION"]);
    expect(dims({ baselineDeviation: { pitchStdZ: -2 } })).toEqual(["DEPRESSION"]);
    expect(dims({ baselineDeviation: { pitchStdZ: 2 } })).toEqual(["FEAR_ANXIETY"]);
    expect(dims({ events: [{ type: "SOBBING", confidence: 0.9 }] })).toEqual(["SEVERE_TRAUMA"]);
  });
  it("ignores neutral, unsure and pre-baseline windows", () => {
    expect(voiceSignals({ emotion: { label: "neutral", confidence: 0.9 } })).toEqual([]);
    expect(voiceSignals({ emotion: { label: "fear", confidence: 0.2 } })).toEqual([]);
    expect(voiceSignals({ emotion: null, baselineDeviation: null, events: [] })).toEqual([]);
  });
});

describe("voice alone never reaches Critical (FR-VOI-08, AC-VOI-05)", () => {
  it("even the worst possible voice window in every dimension stays below Critical", () => {
    const sigs = voiceSignals(WORST);
    // Worst case beyond what the mapping produces: every dimension at the maximum voice score.
    const everywhere: IndicatorInput[] = DIMENSIONS.map((d) => ({ dimension: d, source: "VOICE", score: 1, confidence: 1 }));
    for (const indicators of [sigs.map((s) => ({ dimension: s.dimension, source: "VOICE" as const, score: s.score, confidence: s.confidence })), everywhere]) {
      const r = assess({ indicators, config: DEFAULT_CONFIG });
      expect(r.band).not.toBe("CRITICAL");
      expect(r.svi).toBeLessThan(DEFAULT_CONFIG.bandThresholds.critical);
      expect(r.overridesFired).toEqual([]);
    }
  });
});

describe("fuseEmotion (FR-EMO-02, AC-EMO-01)", () => {
  it("weights text and voice by confidence", () => {
    const f = fuseEmotion({ label: "fear", confidence: 0.9 }, { label: "sadness", confidence: 0.3, distribution: { sadness: 1 } })!;
    expect(f.label).toBe("fear");
    expect(f.confidence).toBeCloseTo(0.75, 2);
    expect(f.distribution.sadness).toBeCloseTo(0.25, 2);
  });
  it("uses the voice distribution when there is one", () => {
    const f = fuseEmotion(null, { label: "fear", confidence: 0.6, distribution: { fear: 0.6, neutral: 0.4 } })!;
    expect(f.label).toBe("fear");
    expect(f.distribution).toEqual({ fear: 0.6, neutral: 0.4 });
  });
  it("returns null with no signals", () => {
    expect(fuseEmotion(null, null)).toBeNull();
  });
});

describe("suggestQuestions (FR-CH-04, FR-DSH-01): scripted questions for the operator to ask aloud", () => {
  const q = (k: string) => `operatorQuestions.${k}`;
  it("puts safety first when nothing is known", () => {
    expect(suggestQuestions({ dimensions: {}, suicideSignal: false, notSafeNow: false }).map((s) => s.key)).toEqual([
      q("safeNow"),
      q("accusedNearby"),
      q("sayMore"),
    ]);
  });
  it("asks about suicidal thoughts on any sign, and about intent when the signs are clear, at most three", () => {
    const s = suggestQuestions({ dimensions: { SUICIDAL_IDEATION: 0.6, INTIMIDATION: 0.7 }, suicideSignal: true, notSafeNow: false });
    expect(s.map((x) => x.key)).toEqual([q("safeNow"), q("suicidalThoughts"), q("suicidalIntent")]);
    expect(s.every((x) => x.reason.length > 0)).toBe(true);
  });
  it("asks for a safe place once the person has said they are not safe (OV-9)", () => {
    const s = suggestQuestions({ dimensions: { INTIMIDATION: 0.7 }, suicideSignal: false, notSafeNow: true });
    expect(s.map((x) => x.key)).toEqual([q("safePlace"), q("accusedNearby"), q("threatDetails")]);
  });
  it("suggests a wellbeing question when the evidence points at anxiety, low mood or trauma", () => {
    expect(suggestQuestions({ dimensions: { FEAR_ANXIETY: 0.6 }, suicideSignal: false, notSafeNow: false }).map((x) => x.key)).toEqual([
      q("safeNow"),
      q("accusedNearby"),
      q("nervous"),
    ]);
    expect(suggestQuestions({ dimensions: { SEVERE_TRAUMA: 0.5 }, suicideSignal: false, notSafeNow: true }).map((x) => x.key)).toContain(q("badDreams"));
  });
  it("only ever suggests keys that exist in every language", () => {
    const all = [
      suggestQuestions({ dimensions: {}, suicideSignal: false, notSafeNow: false }),
      suggestQuestions({ dimensions: { SUICIDAL_IDEATION: 0.9 }, suicideSignal: true, notSafeNow: true }),
      suggestQuestions({ dimensions: { SOCIAL_ISOLATION: 0.8, EXTREME_VULNERABILITY: 0.8 }, suicideSignal: false, notSafeNow: false }),
      suggestQuestions({ dimensions: { FEAR_ANXIETY: 0.9, DEPRESSION: 0.9, SEVERE_TRAUMA: 0.9 }, suicideSignal: false, notSafeNow: false }),
    ].flat();
    for (const lang of VICTIM_LANGS) for (const s of all) expect(hasKey(lang, s.key), `${lang}: ${s.key}`).toBe(true);
  });
});
