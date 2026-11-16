/**
 * Scoring config v1: the single source of the default weights, thresholds,
 * overrides and recommendation rules (task 2.1, REQUIREMENTS Appendices A–C).
 * The seed script stores this in `scoring_configs`; tests use it directly.
 */
import type { ScoringConfig } from "./types";

export const DEFAULT_CONFIG: ScoringConfig = {
  version: 3, // v2: OV-9 "not safe right now" → minimum High · v3: screener source removed (task M.3)

  // Appendix A, step 2 (sums to 1)
  dimensionWeights: {
    SUICIDAL_IDEATION: 0.2,
    INTIMIDATION: 0.15,
    SEVERE_TRAUMA: 0.15,
    EXTREME_VULNERABILITY: 0.12,
    FEAR_ANXIETY: 0.12,
    DEPRESSION: 0.1,
    SOCIAL_ISOLATION: 0.08,
    ACUTE_STRESS: 0.08,
  },

  // Appendix A, step 1. The safety lexicon reads explicit statements, like TEXT_NLP. Weights are
  // relative (the fusion divides by the weights present); SCREENER (0.3) was removed in v3.
  sourceWeights: {
    TEXT_NLP: 0.4,
    SAFETY_LEXICON: 0.4,
    CONTEXT: 0.15,
    VOICE: 0.15,
  },

  // FR-VOI-08: voice alone never above 0.6 per dimension
  voiceOnlyCap: 0.6,

  // Appendix A, step 3: 0–29 Low · 30–54 Moderate · 55–74 High · 75–100 Critical
  bandThresholds: { moderate: 30, high: 55, critical: 75 },

  // Appendix B
  safetyOverrides: [
    {
      id: "OV-1",
      whenAny: ["SUICIDAL_INTENT"],
      minBand: "CRITICAL",
      label: { en: "suicidal thoughts with intent, plan or means", hi: "इरादे, योजना या साधन के साथ आत्महत्या के विचार" },
    },
    {
      id: "OV-2",
      whenAny: ["ACCUSED_PRESENT", "CONFINED"],
      minBand: "CRITICAL",
      label: { en: "accused present or nearby now, or the person is confined", hi: "आरोपी अभी पास में है, या व्यक्ति बंद है" },
    },
    {
      id: "OV-3",
      whenAny: ["SERIOUS_INJURY"],
      minBand: "CRITICAL",
      label: { en: "current serious injury needing urgent care", hi: "अभी गंभीर चोट, तुरंत इलाज की ज़रूरत" },
    },
    {
      id: "OV-4",
      whenAny: ["THREAT_TO_LIFE"],
      minBand: "HIGH",
      label: { en: "explicit threat to life of the person or family", hi: "व्यक्ति या परिवार की जान को सीधी धमकी" },
    },
    {
      id: "OV-5",
      whenAny: ["SEXUAL_OFFENCE_MINOR"],
      minBand: "HIGH",
      label: { en: "sexual offence and the person is a minor", hi: "यौन अपराध और व्यक्ति नाबालिग है" },
    },
    {
      id: "OV-6",
      whenAny: ["PASSIVE_SUICIDAL_IDEATION"],
      minBand: "HIGH",
      label: { en: "wishes to be dead (no plan reported)", hi: "मरने की इच्छा (कोई योजना नहीं बताई)" },
    },
    {
      id: "OV-7",
      whenAny: ["PRESSURE_TO_WITHDRAW"],
      minBand: "HIGH",
      label: { en: "pressure to withdraw the complaint or turn hostile", hi: "शिकायत वापस लेने या गवाही बदलने का दबाव" },
    },
    {
      id: "OV-8",
      whenAny: ["DISPLACED"],
      minBand: "MODERATE",
      label: { en: "displaced or homeless because of the atrocity", hi: "घटना के कारण घर छूटा या बेघर" },
    },
    {
      id: "OV-9",
      whenAny: ["NOT_SAFE_NOW"],
      minBand: "HIGH",
      label: { en: "says they are not safe right now", hi: "अभी सुरक्षित महसूस नहीं करते" },
    },
  ],

  // Appendix C
  recommendationRules: [
    {
      id: "REC-EMERGENCY-CRITICAL",
      type: "EMERGENCY_SUPPORT",
      anyOf: [{ band: "CRITICAL" }],
      responsibleRole: "COUNSELLOR",
      urgencyByBand: { CRITICAL: "WITHIN_15_MIN" },
      requiresApproval: false, // auto-triggered, reviewed afterwards (FR-REC-05)
      reason: "Critical risk: show 112 and Tele-MANAS 14416, immediate counsellor callback",
    },
    {
      id: "REC-COUNSELLING-CRISIS",
      type: "COUNSELLING",
      anyOf: [{ dimension: "SUICIDAL_IDEATION", gte: 0.5 }, { override: "OV-1" }, { override: "OV-6" }],
      responsibleRole: "COUNSELLOR",
      urgencyByBand: { CRITICAL: "WITHIN_15_MIN", HIGH: "WITHIN_24_H" },
      requiresApproval: true,
      reason: "Crisis counselling: signs of suicidal thoughts",
    },
    {
      id: "REC-COUNSELLING-TRAUMA",
      type: "COUNSELLING",
      anyOf: [
        { dimension: "DEPRESSION", gte: 0.5 },
        { dimension: "SEVERE_TRAUMA", gte: 0.5 },
        { dimension: "FEAR_ANXIETY", gte: 0.5 },
      ],
      responsibleRole: "COUNSELLOR",
      urgencyByBand: { HIGH: "WITHIN_24_H", MODERATE: "WITHIN_72_H" },
      requiresApproval: true,
      reason: "Trauma-informed counselling: signs of depression, trauma or fear",
    },
    {
      id: "REC-POLICE-INTIMIDATION",
      type: "POLICE_INTERVENTION",
      anyOf: [{ dimension: "INTIMIDATION", gte: 0.5 }, { override: "OV-2" }, { override: "OV-4" }],
      responsibleRole: "POLICE_LIAISON",
      urgencyByBand: { CRITICAL: "IMMEDIATE", HIGH: "WITHIN_24_H" },
      requiresApproval: true,
      reason: "Protection visit or patrolling: threats or intimidation reported",
    },
    {
      id: "REC-WITNESS-PROTECTION",
      type: "WITNESS_PROTECTION",
      anyOf: [{ override: "OV-7" }, { fact: "WITNESS_UNDER_THREAT" }],
      responsibleRole: "DISTRICT_OFFICER",
      urgencyByBand: { CRITICAL: "WITHIN_24_H", HIGH: "WITHIN_24_H", MODERATE: "WITHIN_24_H", LOW: "WITHIN_24_H" },
      requiresApproval: true,
      reason: "Witness protection: pressure to withdraw or a witness under threat",
      legalBasis: "SC/ST (Prevention of Atrocities) Act, 1989, Chapter IV-A: rights of victims and witnesses",
    },
    {
      id: "REC-MEDICAL",
      type: "MEDICAL_ASSISTANCE",
      anyOf: [{ override: "OV-3" }, { fact: "SEXUAL_OFFENCE" }],
      responsibleRole: "WELFARE_OFFICER",
      urgencyByBand: { CRITICAL: "IMMEDIATE", HIGH: "WITHIN_24_H", MODERATE: "WITHIN_24_H", LOW: "WITHIN_24_H" },
      requiresApproval: true,
      reason: "Medical examination or treatment: injury or sexual offence",
    },
    {
      id: "REC-LEGAL-AID",
      type: "LEGAL_AID",
      anyOf: [{ fact: "COMPLAINT_NOT_REGISTERED" }, { fact: "RIGHTS_CONFUSION" }, { fact: "LONG_RUNNING_CASE" }],
      responsibleRole: "WELFARE_OFFICER",
      urgencyByBand: { CRITICAL: "WITHIN_72_H", HIGH: "WITHIN_72_H", MODERATE: "WITHIN_72_H", LOW: "WITHIN_72_H" },
      requiresApproval: true,
      reason: "Legal aid: complaint not registered, unsure of rights, or a long-running case",
      legalBasis: "District Legal Services Authority (Legal Services Authorities Act, 1987)",
    },
    {
      id: "REC-REHAB-ISOLATION",
      type: "REHABILITATION_RELIEF",
      anyOf: [{ dimension: "SOCIAL_ISOLATION", gte: 0.5 }, { override: "OV-8" }],
      responsibleRole: "WELFARE_OFFICER",
      urgencyByBand: { CRITICAL: "WITHIN_72_H", HIGH: "WITHIN_72_H", MODERATE: "WITHIN_72_H", LOW: "WITHIN_72_H" },
      requiresApproval: true,
      reason: "Rehabilitation and relief: isolation, boycott or displacement",
    },
    {
      id: "REC-INFO-LOW",
      type: "INFORMATION",
      anyOf: [{ band: "LOW" }],
      responsibleRole: "COUNSELLOR",
      urgencyByBand: { LOW: "NONE" },
      requiresApproval: false, // automatic (Appendix C)
      reason: "Information on rights, the self-help line, and an optional follow-up",
    },
  ],

  alertPolicy: {
    criticalAckTimeoutSec: 120,
    escalationChain: ["COUNSELLOR", "NHAA_SUPERVISOR", "DISTRICT_OFFICER"],
  },
};
