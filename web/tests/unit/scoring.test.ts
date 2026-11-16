import { describe, expect, it } from "vitest";
import { assess } from "@/core/scoring/assess";
import { assignBand, maxBand } from "@/core/scoring/bands";
import { validateConfig } from "@/core/scoring/config";
import { DEFAULT_CONFIG } from "@/core/scoring/defaultConfig";
import { explain } from "@/core/scoring/explain";
import { effective, fuseDimensions } from "@/core/scoring/fuse";
import { applyOverrides, flagsFrom } from "@/core/scoring/overrides";
import { computeSvi } from "@/core/scoring/svi";
import type { Dimension, IndicatorInput, OverrideFlag, ScoringConfig } from "@/core/scoring/types";
import { DIMENSIONS } from "@/models/enums";

const cfg = DEFAULT_CONFIG;
let n = 0;
const ind = (dimension: Dimension, score: number, extra: Partial<IndicatorInput> = {}): IndicatorInput => ({
  id: `i${++n}`,
  dimension,
  source: "TEXT_NLP",
  score,
  confidence: 1,
  ...extra,
});
const sviOf = (indicators: IndicatorInput[]) => computeSvi(fuseDimensions(indicators, cfg), cfg).svi;

describe("scoring config (task 2.1)", () => {
  it("the default config is valid", () => {
    expect(validateConfig(DEFAULT_CONFIG)).toMatchObject({ ok: true });
  });

  it("rejects dimension weights that do not sum to 1", () => {
    const bad = { ...cfg, dimensionWeights: { ...cfg.dimensionWeights, DEPRESSION: 0.2 } };
    const r = validateConfig(bad);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.errors.join()).toMatch(/sum to 1/);
  });

  it("rejects thresholds out of order", () => {
    const r = validateConfig({ ...cfg, bandThresholds: { moderate: 30, high: 80, critical: 75 } });
    expect(!r.ok && r.errors.join()).toMatch(/must increase/);
  });

  it("rejects a recommendation rule that names an unknown override", () => {
    const rules = [{ ...cfg.recommendationRules[0]!, anyOf: [{ override: "OV-99" }] }];
    const r = validateConfig({ ...cfg, recommendationRules: rules });
    expect(!r.ok && r.errors.join()).toMatch(/unknown override OV-99/);
  });

  it("rejects a missing dimension weight", () => {
    const weights: Partial<typeof cfg.dimensionWeights> = { ...cfg.dimensionWeights };
    delete weights.DEPRESSION;
    expect(validateConfig({ ...cfg, dimensionWeights: weights }).ok).toBe(false);
  });
});

describe("SVI: 10 hand-calculated examples (AC-SVI-01, Appendix A)", () => {
  // W: SI .20, INT .15, TRA .15, VUL .12, FEAR .12, DEP .10, ISO .08, STR .08
  const cases: [string, IndicatorInput[], number][] = [
    ["no signals", [], 0],
    ["suicidal ideation 1.0 → 100·0.20", [ind("SUICIDAL_IDEATION", 1)], 20],
    ["intimidation 0.8 → 100·0.15·0.8", [ind("INTIMIDATION", 0.8)], 12],
    ["all eight at 1.0", DIMENSIONS.map((d) => ind(d, 1)), 100],
    ["all eight at 0.5", DIMENSIONS.map((d) => ind(d, 0.5)), 50],
    ["SI .9 + INT .9 + FEAR .7 = 18 + 13.5 + 8.4 = 39.9", [ind("SUICIDAL_IDEATION", 0.9), ind("INTIMIDATION", 0.9), ind("FEAR_ANXIETY", 0.7)], 40],
    ["DEP .6 + ISO .5 + STR .4 = 6 + 4 + 3.2 = 13.2", [ind("DEPRESSION", 0.6), ind("SOCIAL_ISOLATION", 0.5), ind("ACUTE_STRESS", 0.4)], 13],
    [
      "TRA .8 + VUL .9 + FEAR .6 + DEP .5 = 12 + 10.8 + 7.2 + 5 = 35",
      [ind("SEVERE_TRAUMA", 0.8), ind("EXTREME_VULNERABILITY", 0.9), ind("FEAR_ANXIETY", 0.6), ind("DEPRESSION", 0.5)],
      35,
    ],
    [
      // (.4·.8·.9 + .4·.9·.6) / (.4·.8 + .4·.9) = .504/.68 = .7412 → 20 × .7412 = 14.82
      "SI text .9@.8 + lexicon .6@.9 fused = .7412 → 14.82",
      [ind("SUICIDAL_IDEATION", 0.9, { confidence: 0.8 }), ind("SUICIDAL_IDEATION", 0.6, { source: "SAFETY_LEXICON", confidence: 0.9 })],
      15,
    ],
    [
      // INT: (.4·.8·.95 + .15·.9·.9)/(.32 + .135) = .4255/.455 = .9352 → 14.03; VUL .9 → 10.8; total 24.83
      "INT lexicon .95@.8 + context .9@.9, VUL context .9@.9 = 24.83",
      [
        ind("INTIMIDATION", 0.95, { source: "SAFETY_LEXICON", confidence: 0.8 }),
        ind("INTIMIDATION", 0.9, { source: "CONTEXT", confidence: 0.9 }),
        ind("EXTREME_VULNERABILITY", 0.9, { source: "CONTEXT", confidence: 0.9 }),
      ],
      25,
    ],
  ];

  it.each(cases)("%s", (_name, indicators, expected) => {
    const svi = sviOf(indicators);
    expect(svi).toBe(expected);
    expect(Number.isInteger(svi)).toBe(true);
  });

  it("contributions add up to the SVI within ±1 (AC-SVI-03)", () => {
    for (const [, indicators] of cases) {
      const r = computeSvi(fuseDimensions(indicators, cfg), cfg);
      const sum = Object.values(r.contributions).reduce((a, b) => a + b, 0);
      expect(Math.abs(sum - r.svi)).toBeLessThanOrEqual(1);
    }
  });
});

describe("fusion (task 2.4)", () => {
  it("takes the maximum within one source", () => {
    const f = fuseDimensions([ind("INTIMIDATION", 0.3), ind("INTIMIDATION", 0.8), ind("INTIMIDATION", 0.5)], cfg);
    expect(f.INTIMIDATION.score).toBeCloseTo(0.8);
  });

  it("caps voice-only dimensions at 0.6 (FR-VOI-08)", () => {
    const f = fuseDimensions([ind("FEAR_ANXIETY", 1, { source: "VOICE" })], cfg);
    expect(f.FEAR_ANXIETY.score).toBe(0.6);
    expect(sviOf([ind("FEAR_ANXIETY", 1, { source: "VOICE" })])).toBe(7); // 12 × 0.6 = 7.2
  });

  it("does not cap voice when another source is present", () => {
    const f = fuseDimensions([ind("FEAR_ANXIETY", 1, { source: "VOICE" }), ind("FEAR_ANXIETY", 1)], cfg);
    expect(f.FEAR_ANXIETY.score).toBe(1);
  });

  it("excludes negated and rejected indicators", () => {
    const f = fuseDimensions(
      [ind("SUICIDAL_IDEATION", 0.9, { negated: true }), ind("INTIMIDATION", 0.9, { status: "REJECTED" })],
      cfg,
    );
    expect(f.SUICIDAL_IDEATION.score).toBe(0);
    expect(f.INTIMIDATION.score).toBe(0);
  });

  it("uses the reviewer's score for ADJUSTED and full confidence for reviewed indicators (FR-IND-05)", () => {
    expect(effective(ind("DEPRESSION", 0.9, { status: "ADJUSTED", reviewScore: 0.2, confidence: 0.3 }))).toEqual({
      score: 0.2,
      confidence: 1,
    });
    expect(effective(ind("DEPRESSION", 0.7, { status: "CONFIRMED", confidence: 0.3 }))).toEqual({ score: 0.7, confidence: 1 });
    expect(effective(ind("DEPRESSION", 0.7, { status: "ADJUSTED", reviewScore: null }))).toBeNull();
  });

  it("clamps out-of-range and invalid values", () => {
    const f = fuseDimensions([ind("DEPRESSION", 1.7), ind("ACUTE_STRESS", Number.NaN)], cfg);
    expect(f.DEPRESSION.score).toBe(1);
    expect(f.ACUTE_STRESS.score).toBe(0);
  });

  it("gives lower confidence with fewer sources (FR-SVI-04)", () => {
    const one = computeSvi(fuseDimensions([ind("INTIMIDATION", 0.8)], cfg), cfg).confidence;
    const two = computeSvi(
      fuseDimensions([ind("INTIMIDATION", 0.8), ind("INTIMIDATION", 0.8, { source: "SAFETY_LEXICON" })], cfg),
      cfg,
    ).confidence;
    expect(one).toBeLessThan(two);
    expect(computeSvi(fuseDimensions([], cfg), cfg).confidence).toBe(0);
  });
});

describe("bands (FR-RISK-01)", () => {
  it.each([
    [0, "LOW"],
    [29, "LOW"],
    [30, "MODERATE"],
    [54, "MODERATE"],
    [55, "HIGH"],
    [74, "HIGH"],
    [75, "CRITICAL"],
    [100, "CRITICAL"],
  ] as const)("SVI %i → %s", (svi, band) => {
    expect(assignBand(svi, cfg.bandThresholds)).toBe(band);
  });

  it("maxBand ignores nulls", () => {
    expect(maxBand(null, "MODERATE", undefined, "LOW")).toBe("MODERATE");
    expect(maxBand()).toBe("LOW");
  });
});

describe("safety overrides, one test each (AC-RISK-02, Appendix B)", () => {
  const cases: [string, OverrideFlag, string][] = [
    ["OV-1", "SUICIDAL_INTENT", "CRITICAL"],
    ["OV-2", "ACCUSED_PRESENT", "CRITICAL"],
    ["OV-2", "CONFINED", "CRITICAL"],
    ["OV-3", "SERIOUS_INJURY", "CRITICAL"],
    ["OV-4", "THREAT_TO_LIFE", "HIGH"],
    ["OV-5", "SEXUAL_OFFENCE_MINOR", "HIGH"],
    ["OV-6", "PASSIVE_SUICIDAL_IDEATION", "HIGH"],
    ["OV-7", "PRESSURE_TO_WITHDRAW", "HIGH"],
    ["OV-8", "DISPLACED", "MODERATE"],
    ["OV-9", "NOT_SAFE_NOW", "HIGH"],
  ];

  it.each(cases)("%s (%s) forces at least %s whatever the SVI", (id, flag, minBand) => {
    const draft = assess({ indicators: [ind("ACUTE_STRESS", 0.05, { flags: [flag] })], config: cfg });
    expect(draft.svi).toBeLessThan(cfg.bandThresholds.moderate);
    expect(draft.computedBand).toBe("LOW");
    expect(draft.band).toBe(minBand);
    expect(draft.overridesFired).toContain(id);
    expect(draft.lockedBand).toBe(minBand);
  });

  it("only raises, never lowers, a band", () => {
    const r = applyOverrides("CRITICAL", new Set<OverrideFlag>(["DISPLACED"]), cfg.safetyOverrides, null);
    expect(r.band).toBe("CRITICAL");
    expect(r.fired).toEqual(["OV-8"]);
  });

  it("lists the strongest override first", () => {
    const r = applyOverrides("LOW", new Set<OverrideFlag>(["DISPLACED", "PRESSURE_TO_WITHDRAW", "ACCUSED_PRESENT"]), cfg.safetyOverrides, null);
    expect(r.fired).toEqual(["OV-2", "OV-7", "OV-8"]);
    expect(r.band).toBe("CRITICAL");
  });

  it("ignores flags on negated, rejected and voice indicators", () => {
    const flags = flagsFrom([
      ind("SUICIDAL_IDEATION", 0.9, { flags: ["SUICIDAL_INTENT"], negated: true }),
      ind("INTIMIDATION", 0.9, { flags: ["THREAT_TO_LIFE"], status: "REJECTED" }),
      ind("FEAR_ANXIETY", 0.9, { flags: ["ACCUSED_PRESENT"], source: "VOICE" }),
    ]);
    expect(flags.size).toBe(0);
  });
});

describe("band lock (FR-RISK-03, AC-RISK-03)", () => {
  it("later calm messages do not lower a band once an override fired", () => {
    const first = assess({ indicators: [ind("INTIMIDATION", 0.9, { flags: ["ACCUSED_PRESENT"] })], config: cfg });
    expect(first.band).toBe("CRITICAL");
    const calm = assess({ indicators: [ind("ACUTE_STRESS", 0.1)], config: cfg, lockedBand: first.lockedBand });
    expect(calm.computedBand).toBe("LOW");
    expect(calm.overridesFired).toEqual([]);
    expect(calm.band).toBe("CRITICAL");
    expect(calm.lockedBand).toBe("CRITICAL");
  });

  it("does not lock when no override fired", () => {
    const d = assess({ indicators: DIMENSIONS.map((dim) => ind(dim, 0.9)), config: cfg });
    expect(d.band).toBe("CRITICAL");
    expect(d.lockedBand).toBeNull();
  });
});

describe("voice alone never reaches Critical (FR-VOI-08, AC-VOI-05)", () => {
  it("even with every dimension at 1.0 and override flags on voice", () => {
    const d = assess({
      indicators: DIMENSIONS.map((dim) =>
        ind(dim, 1, { source: "VOICE", flags: ["SUICIDAL_INTENT", "ACCUSED_PRESENT"] }),
      ),
      config: cfg,
    });
    expect(d.svi).toBe(60);
    expect(d.band).not.toBe("CRITICAL");
    expect(d.overridesFired).toEqual([]);
  });
});

describe("determinism (FR-SVI-07, AC-SVI-04)", () => {
  it("same input twice gives identical output", () => {
    const indicators = [
      ind("SUICIDAL_IDEATION", 0.62, { confidence: 0.71, flags: ["PASSIVE_SUICIDAL_IDEATION"] }),
      ind("INTIMIDATION", 0.83, { source: "SAFETY_LEXICON", confidence: 0.77 }),
      ind("FEAR_ANXIETY", 0.4, { source: "VOICE", confidence: 0.5 }),
      ind("EXTREME_VULNERABILITY", 0.9, { source: "CONTEXT", confidence: 0.9 }),
    ];
    expect(assess({ indicators, config: cfg })).toEqual(assess({ indicators: [...indicators], config: cfg }));
  });

  it("does not depend on the order of indicators", () => {
    const indicators = [ind("INTIMIDATION", 0.5), ind("INTIMIDATION", 0.9, { source: "CONTEXT", confidence: 0.6 }), ind("DEPRESSION", 0.3)];
    const a = assess({ indicators, config: cfg });
    const b = assess({ indicators: [...indicators].reverse(), config: cfg });
    expect(b.svi).toBe(a.svi);
    expect(b.dimensions).toEqual(a.dimensions);
    expect(b.topEvidence).toEqual(a.topEvidence);
  });

  it("records the config version used", () => {
    const other: ScoringConfig = { ...cfg, version: 7 };
    expect(assess({ indicators: [], config: other }).configVersion).toBe(7);
  });
});

describe("assessment draft", () => {
  it("lists top evidence, strongest first, at most three", () => {
    const d = assess({
      indicators: [
        ind("ACUTE_STRESS", 0.3, { label: "a" }),
        ind("SUICIDAL_IDEATION", 0.9, { label: "si" }),
        ind("INTIMIDATION", 0.9, { label: "int" }),
        ind("DEPRESSION", 0.5, { label: "dep" }),
      ],
      config: cfg,
    });
    expect(d.topEvidence.map((e) => e.label)).toEqual(["si", "int", "dep"]);
  });

  it("stores all eight dimensions (AC-IND-01)", () => {
    const d = assess({ indicators: [], config: cfg });
    expect(Object.keys(d.dimensions).sort()).toEqual([...DIMENSIONS].sort());
    for (const v of Object.values(d.dimensions)) {
      expect(v.score).toBeGreaterThanOrEqual(0);
      expect(v.score).toBeLessThanOrEqual(1);
    }
  });

  it("marks limited confidence in fallback mode (NFR-REL-01)", () => {
    const d = assess({ indicators: [ind("INTIMIDATION", 0.9)], config: cfg, limitedConfidence: true });
    expect(d.limitedConfidence).toBe(true);
    expect(d.explanation.en).toMatch(/Limited AI analysis/);
  });
});

describe("explanation (task 2.7, FR-RISK-04)", () => {
  it("names the override in English and Hindi", () => {
    const d = assess({ indicators: [ind("INTIMIDATION", 0.9, { flags: ["ACCUSED_PRESENT"] })], config: cfg });
    expect(d.explanation.en).toMatch(/^Critical \(SVI \d+\): accused present or nearby now.*\(OV-2\)/);
    expect(d.explanation.hi).toMatch(/^गंभीर \(SVI \d+\):.*\(OV-2\)/);
  });

  it("says when nothing was found", () => {
    const text = explain(
      { band: "LOW", svi: 0, overridesFired: [], overrideRules: cfg.safetyOverrides, topDimensions: [], limitedConfidence: false },
      "en",
    );
    expect(text).toBe("Low (SVI 0): no warning signs detected so far.");
  });

  it("never uses diagnostic wording (NFR-ETH-02)", () => {
    const d = assess({ indicators: DIMENSIONS.map((dim) => ind(dim, 0.8)), config: cfg });
    expect(d.explanation.en).not.toMatch(/diagnos|disorder|depression\b|you have/i);
  });
});

describe("scoring config v3 (task M.3)", () => {
  it("has no screener source and keeps the other weights (Appendix A)", () => {
    expect(cfg.version).toBe(3);
    expect(Object.keys(cfg.sourceWeights).sort()).toEqual(["CONTEXT", "SAFETY_LEXICON", "TEXT_NLP", "VOICE"]);
    expect(cfg.sourceWeights).toMatchObject({ TEXT_NLP: 0.4, SAFETY_LEXICON: 0.4, CONTEXT: 0.15, VOICE: 0.15 });
  });
  it("is still a valid config", () => {
    expect(validateConfig(cfg).ok).toBe(true);
  });
});
