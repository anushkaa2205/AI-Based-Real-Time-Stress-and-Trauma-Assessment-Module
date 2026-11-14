/**
 * Scoring config v1, transcribed from REQUIREMENTS.md Appendices A–C.
 * Provisional home for this data: task 2.1 creates core/scoring/defaultConfig.ts
 * as the single source, and the seed should then import it from there.
 */
import type { Dimension, RiskBand, Role, SupportType, Urgency } from "@/models/enums";

/** Appendix A, step 2 (sums to 1) */
export const dimensionWeights: Record<Dimension, number> = {
  SUICIDAL_IDEATION: 0.2,
  INTIMIDATION: 0.15,
  SEVERE_TRAUMA: 0.15,
  EXTREME_VULNERABILITY: 0.12,
  FEAR_ANXIETY: 0.12,
  DEPRESSION: 0.1,
  SOCIAL_ISOLATION: 0.08,
  ACUTE_STRESS: 0.08,
};

/** Appendix A, step 1. SAFETY_LEXICON counts as an explicit-statement source. */
export const sourceWeights = {
  TEXT_NLP: 0.4,
  SAFETY_LEXICON: 0.4,
  SCREENER: 0.3,
  CONTEXT: 0.15,
  VOICE: 0.15,
};

/** Appendix A, step 3: 0–29 Low · 30–54 Moderate · 55–74 High · 75–100 Critical */
export const bandThresholds = { moderate: 30, high: 55, critical: 75 };

/** Appendix B */
export const safetyOverrides: { id: string; condition: string; minBand: RiskBand }[] = [
  { id: "OV-1", condition: "SUICIDAL_IDEATION_WITH_INTENT_PLAN_OR_MEANS", minBand: "CRITICAL" },
  { id: "OV-2", condition: "ACCUSED_PRESENT_NOW_OR_CONFINED", minBand: "CRITICAL" },
  { id: "OV-3", condition: "CURRENT_SERIOUS_INJURY", minBand: "CRITICAL" },
  { id: "OV-4", condition: "EXPLICIT_THREAT_TO_LIFE", minBand: "HIGH" },
  { id: "OV-5", condition: "SEXUAL_OFFENCE_AND_MINOR", minBand: "HIGH" },
  { id: "OV-6", condition: "PASSIVE_SUICIDAL_IDEATION", minBand: "HIGH" },
  { id: "OV-7", condition: "PRESSURE_TO_WITHDRAW_OR_TURN_HOSTILE", minBand: "HIGH" },
  { id: "OV-8", condition: "DISPLACED_OR_HOMELESS", minBand: "MODERATE" },
];

interface RecommendationRule {
  id: string;
  trigger: string;
  type: SupportType;
  responsibleRole: Role;
  urgencyByBand: Partial<Record<RiskBand, Urgency>>;
  requiresApproval: boolean;
  legalBasis?: string;
}

/** Appendix C */
export const recommendationRules: RecommendationRule[] = [
  {
    id: "REC-EMERGENCY-CRITICAL",
    trigger: "band == CRITICAL",
    type: "EMERGENCY_SUPPORT",
    responsibleRole: "COUNSELLOR",
    urgencyByBand: { CRITICAL: "WITHIN_15_MIN" },
    requiresApproval: false, // auto-triggered, reviewed afterwards (FR-REC-05)
  },
  {
    id: "REC-COUNSELLING-CRISIS",
    trigger: "SUICIDAL_IDEATION >= 0.5 or OV-1 or OV-6",
    type: "COUNSELLING",
    responsibleRole: "COUNSELLOR",
    urgencyByBand: { CRITICAL: "WITHIN_15_MIN", HIGH: "WITHIN_24_H" },
    requiresApproval: true,
  },
  {
    id: "REC-COUNSELLING-TRAUMA",
    trigger: "DEPRESSION or SEVERE_TRAUMA or FEAR_ANXIETY >= 0.5",
    type: "COUNSELLING",
    responsibleRole: "COUNSELLOR",
    urgencyByBand: { HIGH: "WITHIN_24_H", MODERATE: "WITHIN_72_H" },
    requiresApproval: true,
  },
  {
    id: "REC-POLICE-INTIMIDATION",
    trigger: "INTIMIDATION >= 0.5 or OV-2 or OV-4",
    type: "POLICE_INTERVENTION",
    responsibleRole: "POLICE_LIAISON",
    urgencyByBand: { CRITICAL: "IMMEDIATE", HIGH: "WITHIN_24_H" },
    requiresApproval: true,
  },
  {
    id: "REC-WITNESS-PROTECTION",
    trigger: "OV-7 or witness under threat",
    type: "WITNESS_PROTECTION",
    responsibleRole: "DISTRICT_OFFICER",
    urgencyByBand: { CRITICAL: "WITHIN_24_H", HIGH: "WITHIN_24_H", MODERATE: "WITHIN_24_H" },
    requiresApproval: true,
    legalBasis: "SC/ST (Prevention of Atrocities) Act, 1989: rights of victims and witnesses",
  },
  {
    id: "REC-MEDICAL",
    trigger: "OV-3 (immediate) or sexual offence",
    type: "MEDICAL_ASSISTANCE",
    responsibleRole: "WELFARE_OFFICER",
    urgencyByBand: { CRITICAL: "IMMEDIATE", HIGH: "WITHIN_24_H", MODERATE: "WITHIN_24_H", LOW: "WITHIN_24_H" },
    requiresApproval: true,
  },
  {
    id: "REC-LEGAL-AID",
    trigger: "confusion about rights, long-running case, or complaint not registered",
    type: "LEGAL_AID",
    responsibleRole: "WELFARE_OFFICER",
    urgencyByBand: { CRITICAL: "WITHIN_72_H", HIGH: "WITHIN_72_H", MODERATE: "WITHIN_72_H", LOW: "WITHIN_72_H" },
    requiresApproval: true,
    legalBasis: "District Legal Services Authority",
  },
  {
    id: "REC-REHAB-ISOLATION",
    trigger: "SOCIAL_ISOLATION >= 0.5 or OV-8",
    type: "REHABILITATION_RELIEF",
    responsibleRole: "WELFARE_OFFICER",
    urgencyByBand: { CRITICAL: "WITHIN_72_H", HIGH: "WITHIN_72_H", MODERATE: "WITHIN_72_H", LOW: "WITHIN_72_H" },
    requiresApproval: true,
  },
  {
    id: "REC-INFO-LOW",
    trigger: "band == LOW",
    type: "INFORMATION",
    responsibleRole: "COUNSELLOR",
    urgencyByBand: { LOW: "NONE" },
    requiresApproval: false, // automatic, Appendix C
  },
];

export const alertPolicy = {
  criticalAckTimeoutSec: 120,
  escalationChain: ["COUNSELLOR", "NHAA_SUPERVISOR", "DISTRICT_OFFICER"],
};
