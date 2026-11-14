import { describe, expect, it } from "vitest";
import { dueAt, evaluateRecommendations, urgencyFor, type RecommendationInput } from "@/core/recommendations/evaluate";
import { assess } from "@/core/scoring/assess";
import { DEFAULT_CONFIG } from "@/core/scoring/defaultConfig";
import type { CaseFact, Dimension, IndicatorInput, RiskBand } from "@/core/scoring/types";
import { DIMENSIONS } from "@/models/enums";

const cfg = DEFAULT_CONFIG;

const input = (
  band: RiskBand,
  dims: Partial<Record<Dimension, number>> = {},
  overridesFired: string[] = [],
  facts: CaseFact[] = [],
): RecommendationInput => ({
  band,
  overridesFired,
  facts,
  dimensions: Object.fromEntries(DIMENSIONS.map((d) => [d, { score: dims[d] ?? 0 }])) as RecommendationInput["dimensions"],
});

const types = (i: RecommendationInput) => evaluateRecommendations(i, cfg).map((p) => p.type);

describe("recommendation engine (task 2.9, Appendix C)", () => {
  it("Critical always auto-triggers emergency support, reviewed afterwards (FR-REC-05/06)", () => {
    const [p] = evaluateRecommendations(input("CRITICAL"), cfg);
    expect(p).toMatchObject({ type: "EMERGENCY_SUPPORT", status: "AUTO_TRIGGERED", urgency: "WITHIN_15_MIN" });
  });

  it("suicidal ideation ≥ 0.5 → crisis counselling, 15 min if Critical, 24 h if High", () => {
    const critical = evaluateRecommendations(input("CRITICAL", { SUICIDAL_IDEATION: 0.8 }), cfg).find((p) => p.ruleId === "REC-COUNSELLING-CRISIS");
    const high = evaluateRecommendations(input("HIGH", {}, ["OV-6"]), cfg).find((p) => p.ruleId === "REC-COUNSELLING-CRISIS");
    expect(critical?.urgency).toBe("WITHIN_15_MIN");
    expect(high?.urgency).toBe("WITHIN_24_H");
    expect(high?.reason).toContain("OV-6");
  });

  it("depends on indicators, not only the band (FR-REC-02)", () => {
    expect(types(input("HIGH", { INTIMIDATION: 0.9 }))).toContain("POLICE_INTERVENTION");
    expect(types(input("HIGH", { DEPRESSION: 0.9 }))).not.toContain("POLICE_INTERVENTION");
    expect(types(input("HIGH", { DEPRESSION: 0.9 }))).toContain("COUNSELLING");
  });

  it("intimidation is immediate police intervention when Critical", () => {
    const p = evaluateRecommendations(input("CRITICAL", {}, ["OV-2"]), cfg).find((r) => r.type === "POLICE_INTERVENTION");
    expect(p).toMatchObject({ urgency: "IMMEDIATE", responsibleRole: "POLICE_LIAISON", status: "PROPOSED" });
  });

  it("pressure to withdraw → witness protection with its legal basis (FR-REC-04)", () => {
    const p = evaluateRecommendations(input("HIGH", {}, ["OV-7"]), cfg).find((r) => r.type === "WITNESS_PROTECTION");
    expect(p?.legalBasis).toMatch(/Prevention of Atrocities/);
    expect(p?.responsibleRole).toBe("DISTRICT_OFFICER");
  });

  it("injury → immediate medical assistance; sexual offence → medical within 24 h", () => {
    expect(evaluateRecommendations(input("CRITICAL", {}, ["OV-3"]), cfg).find((p) => p.type === "MEDICAL_ASSISTANCE")?.urgency).toBe("IMMEDIATE");
    expect(evaluateRecommendations(input("MODERATE", {}, [], ["SEXUAL_OFFENCE"]), cfg).find((p) => p.type === "MEDICAL_ASSISTANCE")?.urgency).toBe("WITHIN_24_H");
  });

  it("complaint not registered → legal aid", () => {
    expect(types(input("MODERATE", {}, [], ["COMPLAINT_NOT_REGISTERED"]))).toContain("LEGAL_AID");
  });

  it("isolation or displacement → rehabilitation and relief", () => {
    expect(types(input("MODERATE", { SOCIAL_ISOLATION: 0.7 }))).toContain("REHABILITATION_RELIEF");
    expect(types(input("MODERATE", {}, ["OV-8"]))).toContain("REHABILITATION_RELIEF");
  });

  it("Low band gets automatic information only", () => {
    expect(evaluateRecommendations(input("LOW"), cfg)).toEqual([
      expect.objectContaining({ type: "INFORMATION", status: "AUTO_TRIGGERED", urgency: "NONE" }),
    ]);
  });

  it("every proposal states reason, urgency and responsible role (AC-REC-02)", () => {
    const all = evaluateRecommendations(
      input("CRITICAL", Object.fromEntries(DIMENSIONS.map((d) => [d, 1])), ["OV-1", "OV-2", "OV-3", "OV-7", "OV-8"], ["COMPLAINT_NOT_REGISTERED", "SEXUAL_OFFENCE"]),
      cfg,
    );
    for (const p of all) {
      expect(p.reason.length).toBeGreaterThan(10);
      expect(p.urgency).toBeTruthy();
      expect(p.responsibleRole).toBeTruthy();
    }
  });

  it("only emergency support and Low information skip approval (rule 7)", () => {
    const all = evaluateRecommendations(
      input("CRITICAL", Object.fromEntries(DIMENSIONS.map((d) => [d, 1])), ["OV-1", "OV-2", "OV-3", "OV-7", "OV-8"], ["COMPLAINT_NOT_REGISTERED"]),
      cfg,
    );
    expect(all.filter((p) => p.status === "AUTO_TRIGGERED").map((p) => p.type)).toEqual(["EMERGENCY_SUPPORT"]);
  });

  it("all six support types are reachable (task 2.10, AC-REC-01)", () => {
    const reached = new Set([
      ...types(input("CRITICAL", { SUICIDAL_IDEATION: 0.9, INTIMIDATION: 0.9 }, ["OV-3"])),
      ...types(input("HIGH", {}, ["OV-7"], ["COMPLAINT_NOT_REGISTERED"])),
    ]);
    for (const t of ["COUNSELLING", "LEGAL_AID", "MEDICAL_ASSISTANCE", "POLICE_INTERVENTION", "WITNESS_PROTECTION", "EMERGENCY_SUPPORT"]) {
      expect(reached.has(t as never), t).toBe(true);
    }
  });

  it("uses the nearest listed band when the band has no urgency of its own", () => {
    const trauma = cfg.recommendationRules.find((r) => r.id === "REC-COUNSELLING-TRAUMA")!;
    expect(urgencyFor(trauma, "CRITICAL")).toBe("WITHIN_24_H");
    expect(urgencyFor(trauma, "LOW")).toBe("WITHIN_72_H");
  });

  it("computes due times from a passed-in clock", () => {
    const now = Date.UTC(2026, 10, 14, 12, 0, 0);
    expect(dueAt("WITHIN_15_MIN", now)?.toISOString()).toBe("2026-11-14T12:15:00.000Z");
    expect(dueAt("IMMEDIATE", now)?.getTime()).toBe(now);
    expect(dueAt("NONE", now)).toBeNull();
  });

  it("works end to end from an assessment", () => {
    const indicators: IndicatorInput[] = [
      { id: "a", dimension: "INTIMIDATION", source: "SAFETY_LEXICON", score: 0.95, confidence: 0.8, flags: ["ACCUSED_PRESENT"] },
    ];
    const d = assess({ indicators, config: cfg });
    const proposals = evaluateRecommendations(
      { band: d.band, overridesFired: d.overridesFired, dimensions: d.dimensions, facts: [] },
      cfg,
    );
    expect(proposals.map((p) => p.type)).toEqual(["EMERGENCY_SUPPORT", "POLICE_INTERVENTION"]);
  });
});
