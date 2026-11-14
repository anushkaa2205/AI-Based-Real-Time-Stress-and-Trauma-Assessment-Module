/**
 * Recommendation engine (task 2.9, FR-REC-01…04, REQUIREMENTS Appendix C).
 * Pure: assessment + facts in, proposals out. Depends on the band AND on the
 * specific indicators/overrides/facts, not on the band alone (FR-REC-02).
 *
 * Every proposal needs human approval (CLAUDE.md rule 7) except:
 *  - EMERGENCY_SUPPORT for Critical: AUTO_TRIGGERED, reviewed afterwards (FR-REC-05)
 *  - INFORMATION for Low: automatic (Appendix C)
 */
import { BAND_RANK, RISK_BANDS } from "@/models/enums";
import type { Role, SupportType, Urgency } from "@/models/enums";
import type { CaseFact, Dimension, RecCondition, RecommendationRule, RiskBand, ScoringConfig } from "@/core/scoring/types";

export interface RecommendationInput {
  band: RiskBand;
  overridesFired: readonly string[];
  dimensions: Record<Dimension, { score: number }>;
  facts: readonly CaseFact[];
}

export interface Proposal {
  ruleId: string;
  type: SupportType;
  /** Plain reason plus what triggered it, e.g. "…: OV-7, intimidation 0.85" */
  reason: string;
  urgency: Urgency;
  responsibleRole: Role;
  legalBasis?: string;
  /** PROPOSED needs approval; AUTO_TRIGGERED/automatic ones do not */
  status: "PROPOSED" | "AUTO_TRIGGERED";
}

const DIM_LABEL: Record<Dimension, string> = {
  ACUTE_STRESS: "acute stress",
  SEVERE_TRAUMA: "severe trauma",
  FEAR_ANXIETY: "fear/anxiety",
  DEPRESSION: "depression",
  SUICIDAL_IDEATION: "suicidal ideation",
  INTIMIDATION: "intimidation",
  SOCIAL_ISOLATION: "social isolation",
  EXTREME_VULNERABILITY: "extreme vulnerability",
};

/** What made the condition true, or null if it is false. */
function check(cond: RecCondition, input: RecommendationInput): string | null {
  if ("band" in cond) return input.band === cond.band ? `band ${cond.band}` : null;
  if ("override" in cond) return input.overridesFired.includes(cond.override) ? cond.override : null;
  if ("fact" in cond) return input.facts.includes(cond.fact) ? cond.fact.toLowerCase().replace(/_/g, " ") : null;
  const score = input.dimensions[cond.dimension]?.score ?? 0;
  return score >= cond.gte ? `${DIM_LABEL[cond.dimension]} ${score.toFixed(2)}` : null;
}

/** Urgency for the band; if the band is not listed, the nearest listed band (higher first). */
export function urgencyFor(rule: RecommendationRule, band: RiskBand): Urgency {
  const direct = rule.urgencyByBand[band];
  if (direct) return direct;
  const rank = BAND_RANK[band];
  const listed = RISK_BANDS.filter((b) => rule.urgencyByBand[b]);
  const nearest = [...listed].sort(
    (a, b) => Math.abs(BAND_RANK[a] - rank) - Math.abs(BAND_RANK[b] - rank) || BAND_RANK[b] - BAND_RANK[a],
  )[0];
  return (nearest && rule.urgencyByBand[nearest]) || "WITHIN_72_H";
}

export function evaluateRecommendations(input: RecommendationInput, config: ScoringConfig): Proposal[] {
  const out: Proposal[] = [];
  for (const rule of config.recommendationRules) {
    const reasons = rule.anyOf.map((c) => check(c, input)).filter((r): r is string => r !== null);
    if (!reasons.length) continue;
    out.push({
      ruleId: rule.id,
      type: rule.type,
      reason: `${rule.reason} (${reasons.join(", ")})`,
      urgency: urgencyFor(rule, input.band),
      responsibleRole: rule.responsibleRole,
      ...(rule.legalBasis ? { legalBasis: rule.legalBasis } : {}),
      status: rule.requiresApproval ? "PROPOSED" : "AUTO_TRIGGERED",
    });
  }
  return out;
}

const URGENCY_MS: Record<Urgency, number | null> = {
  IMMEDIATE: 0,
  WITHIN_15_MIN: 15 * 60_000,
  WITHIN_24_H: 24 * 3_600_000,
  WITHIN_72_H: 72 * 3_600_000,
  NONE: null,
};

/** Due time for an urgency; the clock is passed in so this stays pure. */
export function dueAt(urgency: Urgency, nowMs: number): Date | null {
  const ms = URGENCY_MS[urgency];
  return ms === null ? null : new Date(nowMs + ms);
}
