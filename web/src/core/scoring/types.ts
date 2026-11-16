/**
 * Types for the deterministic scoring core (task 2.1, ARCHITECTURE §8).
 * Everything in core/scoring, core/safety-lexicon and
 * core/recommendations is pure: inputs in, result out. No I/O, no clock.
 * The AI finds indicators; these rules compute the score (CLAUDE.md rule 3).
 */
import type { Dimension, IndicatorStatus, RiskBand, Role, SignalSource, SupportType, Urgency } from "@/models/enums";

export type { Dimension, RiskBand, SignalSource };

/**
 * Facts that can force a minimum band (REQUIREMENTS Appendix B). Indicators
 * from text (lexicon, NLP) and case context may carry them; voice never does (FR-VOI-08).
 */
export const OVERRIDE_FLAGS = [
  "SUICIDAL_INTENT", // intent, plan or means
  "PASSIVE_SUICIDAL_IDEATION", // wishing to be dead, no plan
  "ACCUSED_PRESENT", // accused present or nearby now
  "CONFINED", // locked in / confined
  "SERIOUS_INJURY", // current injury needing urgent care
  "THREAT_TO_LIFE", // explicit threat to the life of the victim or family
  "SEXUAL_OFFENCE_MINOR", // sexual offence and the victim is a minor
  "PRESSURE_TO_WITHDRAW", // pressure to withdraw the complaint or turn hostile
  "DISPLACED", // displaced or homeless because of the atrocity
  "NOT_SAFE_NOW", // says in their own words they are not safe right now (OV-9; lexicon rules, task M.3)
] as const;
export type OverrideFlag = (typeof OVERRIDE_FLAGS)[number];

/** Facts that drive recommendations but not the score (REQUIREMENTS Appendix C). */
export const CASE_FACTS = [
  "COMPLAINT_NOT_REGISTERED",
  "RIGHTS_CONFUSION",
  "LONG_RUNNING_CASE",
  "WITNESS_UNDER_THREAT",
  "SEXUAL_OFFENCE",
  "NOT_SAFE_NOW",
] as const;
export type CaseFact = (typeof CASE_FACTS)[number];

/** One detected signal, from any source. Mirrors the `indicators` collection. */
export interface IndicatorInput {
  id?: string;
  dimension: Dimension;
  source: SignalSource;
  score: number; // 0–1
  confidence: number; // 0–1
  negated?: boolean;
  status?: IndicatorStatus;
  /** Responder's adjusted score (FR-IND-05); used when status is ADJUSTED */
  reviewScore?: number | null;
  flags?: readonly OverrideFlag[];
  /** Short staff-facing label, e.g. "Pressure to withdraw the complaint" */
  label?: string;
}

export interface BandThresholds {
  moderate: number;
  high: number;
  critical: number;
}

export interface OverrideRule {
  id: string; // "OV-1"
  /** Fires when any of these flags is present */
  whenAny: readonly OverrideFlag[];
  minBand: RiskBand;
  label: { en: string; hi: string };
}

/** A condition in a recommendation rule. A rule fires when ANY condition holds. */
export type RecCondition =
  | { band: RiskBand }
  | { dimension: Dimension; gte: number }
  | { override: string }
  | { fact: CaseFact };

export interface RecommendationRule {
  id: string;
  type: SupportType;
  anyOf: readonly RecCondition[];
  responsibleRole: Role;
  /** Urgency per band; bands not listed use the nearest listed band (higher first). */
  urgencyByBand: Partial<Record<RiskBand, Urgency>>;
  /** false = automatic (Low information) or auto-triggered (Critical emergency) */
  requiresApproval: boolean;
  reason: string;
  legalBasis?: string;
}

export interface ScoringConfig {
  version: number;
  dimensionWeights: Record<Dimension, number>;
  sourceWeights: Record<SignalSource, number>;
  voiceOnlyCap: number;
  bandThresholds: BandThresholds;
  safetyOverrides: readonly OverrideRule[];
  recommendationRules: readonly RecommendationRule[];
  alertPolicy: { criticalAckTimeoutSec: number; escalationChain: readonly Role[] };
}

export interface DimensionResult {
  score: number;
  confidence: number;
  bySource: Partial<Record<SignalSource, number>>;
  /** Points this dimension adds to the SVI (one decimal) */
  contribution: number;
}

export interface AssessmentDraft {
  svi: number;
  computedBand: RiskBand;
  band: RiskBand;
  overridesFired: string[];
  /** Band the AI may not go below from now on (FR-RISK-03); null if none */
  lockedBand: RiskBand | null;
  dimensions: Record<Dimension, DimensionResult>;
  confidence: number;
  limitedConfidence: boolean;
  topEvidence: { indicatorId: string | null; dimension: Dimension; label: string }[];
  explanation: { en: string; hi: string };
  configVersion: number;
}
