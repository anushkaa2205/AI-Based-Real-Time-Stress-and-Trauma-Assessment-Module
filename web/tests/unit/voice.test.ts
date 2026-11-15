/** Voice → scoring signals, emotion fusion, operator suggestions (tasks 7.3–7.5, 7.7; AC-VOI-02/05, AC-EMO-01). */
import { describe, expect, it } from "vitest";
import { suggestQuestions } from "@/core/conversation/suggest";
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

describe("suggestQuestions (FR-CH-04)", () => {
  const none = new Map<string, number | null>();
  it("asks the safety check first", () => {
    expect(suggestQuestions({ answered: none, dimensions: {}, suicideSignal: false }).map((s) => s.key)).toEqual([
      "flow.screener.SAFETY_SAFE_NOW",
      "flow.screener.SAFETY_ACCUSED_NEARBY",
    ]);
  });
  it("follows the evidence once the safety check is done, at most three", () => {
    const answered = new Map<string, number | null>([
      ["SAFETY_SAFE_NOW", 0],
      ["SAFETY_ACCUSED_NEARBY", 0],
    ]);
    const s = suggestQuestions({ answered, dimensions: { SUICIDAL_IDEATION: 0.4, INTIMIDATION: 0.7, DEPRESSION: 0.5 }, suicideSignal: false });
    expect(s.map((x) => x.key)).toEqual(["flow.screener.SAFETY_SUICIDAL_THOUGHTS", "suggest.safePlace", "suggest.threatDetails"]);
    expect(s.every((x) => x.reason.length > 0)).toBe(true);
  });
  it("asks about intent after a yes to suicidal thoughts", () => {
    const answered = new Map<string, number | null>([
      ["SAFETY_SAFE_NOW", 1],
      ["SAFETY_ACCUSED_NEARBY", 0],
      ["SAFETY_SUICIDAL_THOUGHTS", 1],
    ]);
    expect(suggestQuestions({ answered, dimensions: {}, suicideSignal: true })[0]!.key).toBe("flow.screener.SAFETY_SUICIDAL_INTENT");
  });
  it("invites more when nothing specific is open", () => {
    const answered = new Map<string, number | null>([
      ["SAFETY_SAFE_NOW", 1],
      ["SAFETY_ACCUSED_NEARBY", 0],
    ]);
    expect(suggestQuestions({ answered, dimensions: {}, suicideSignal: false })).toEqual([
      { key: "flow.narrative.more", reason: expect.any(String) },
    ]);
  });
});
