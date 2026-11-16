/**
 * Shared enum constants (split from docs/models.ts, task 1.2).
 * Use these everywhere instead of retyping string literals (CLAUDE.md).
 */

export const ROLES = [
  "OPERATOR",
  "NHAA_SUPERVISOR",
  "COUNSELLOR",
  "DISTRICT_OFFICER",
  "POLICE_LIAISON",
  "WELFARE_OFFICER",
  "STATE_ADMIN",
  "MINISTRY_ADMIN",
  "SYS_ADMIN",
  "AUDITOR",
] as const;
export type Role = (typeof ROLES)[number];

export const CHANNELS = ["PORTAL", "CHATBOT", "VOICE_CALL", "IVRS", "MOBILE_APP", "OPERATOR_ASSISTED", "API"] as const;
export const INTERACTION_STATUSES = ["ACTIVE", "ENDED", "ABANDONED"] as const;
/** What analysis is allowed, derived from consent (FR-CON-02/03) */
export const ASSESSMENT_MODES = ["SAFETY_ONLY", "TEXT_ONLY", "VOICE_ONLY", "FULL"] as const;
export const CONSENT_ACTIONS = ["GRANTED", "UPDATED", "WITHDRAWN"] as const;
export const MESSAGE_SENDERS = ["VICTIM", "SYSTEM", "OPERATOR"] as const;
/** IVR_KEYPRESS removed 16 Nov 2026: the module accepts text and voice only (FR-CH-01). */
export const MESSAGE_MODALITIES = ["TEXT", "VOICE_TRANSCRIPT"] as const;
/** How the input reached the calling system (task M.6, gap V2); separate from `channel` and `modality` */
export const INPUT_METHODS = ["TEXT", "TRANSCRIPT", "LIVE_AUDIO", "RECORDED_AUDIO"] as const;
export type InputMethod = (typeof INPUT_METHODS)[number];

/** The eight risk dimensions (FR-IND-01) */
export const DIMENSIONS = [
  "ACUTE_STRESS",
  "SEVERE_TRAUMA",
  "FEAR_ANXIETY",
  "DEPRESSION",
  "SUICIDAL_IDEATION",
  "INTIMIDATION",
  "SOCIAL_ISOLATION",
  "EXTREME_VULNERABILITY",
] as const;
export type Dimension = (typeof DIMENSIONS)[number];

/** SCREENER removed in scoring config v3 (task M.3). */
export const SIGNAL_SOURCES = ["TEXT_NLP", "SAFETY_LEXICON", "VOICE", "CONTEXT"] as const;
export const EVIDENCE_TYPES = ["TEXT_SPAN", "ACOUSTIC_EVENT", "CONTEXT_FIELD"] as const;
export const INDICATOR_STATUSES = ["ACTIVE", "CONFIRMED", "REJECTED", "ADJUSTED"] as const;
export const RISK_BANDS = ["LOW", "MODERATE", "HIGH", "CRITICAL"] as const;
export type RiskBand = (typeof RISK_BANDS)[number];
export const BAND_RANK: Record<RiskBand, number> = { LOW: 1, MODERATE: 2, HIGH: 3, CRITICAL: 4 };
export const ASSESSMENT_TRIGGERS = [
  "TEXT_MESSAGE",
  "VOICE_WINDOW",
  "CONTEXT_UPDATE",
  "INDICATOR_REVIEW",
  "CONFIG_RESCORE",
] as const;
export const CASE_STATUSES = ["NEW", "UNDER_REVIEW", "ACTION_TAKEN", "FOLLOW_UP_SCHEDULED", "CLOSED"] as const;
export const SUPPORT_TYPES = [
  "COUNSELLING",
  "LEGAL_AID",
  "MEDICAL_ASSISTANCE",
  "POLICE_INTERVENTION",
  "WITNESS_PROTECTION",
  "EMERGENCY_SUPPORT",
  "REHABILITATION_RELIEF",
  "INFORMATION",
] as const;
export const URGENCIES = ["IMMEDIATE", "WITHIN_15_MIN", "WITHIN_24_H", "WITHIN_72_H", "NONE"] as const;
export const RECOMMENDATION_STATUSES = ["PROPOSED", "APPROVED", "REJECTED", "AUTO_TRIGGERED", "SUPERSEDED"] as const;
export const REFERRAL_STATUSES = ["PENDING", "ACCEPTED", "IN_PROGRESS", "DONE", "DECLINED"] as const;
export const ALERT_LEVELS = ["CRITICAL", "HIGH"] as const;
export const ALERT_STATUSES = ["OPEN", "ACKNOWLEDGED", "RESOLVED"] as const;
export const FOLLOW_UP_STATUSES = ["SCHEDULED", "DONE", "MISSED", "CANCELLED"] as const;
/** VICTIM_SESSION is no longer written (no victim sessions); kept so older hash-chained audit entries stay valid. */
export const ACTOR_TYPES = ["USER", "VICTIM_SESSION", "API_CLIENT", "SYSTEM"] as const;
export const JOB_TYPES = ["alert.escalate", "followup.remind", "retention.purge", "rescore", "stats.rollup"] as const;

export type Channel = (typeof CHANNELS)[number];
export type AssessmentMode = (typeof ASSESSMENT_MODES)[number];
export type SignalSource = (typeof SIGNAL_SOURCES)[number];
export type SupportType = (typeof SUPPORT_TYPES)[number];
export type Urgency = (typeof URGENCIES)[number];
export type CaseStatus = (typeof CASE_STATUSES)[number];
export type ReferralStatus = (typeof REFERRAL_STATUSES)[number];
export type ActorType = (typeof ACTOR_TYPES)[number];
export type JobType = (typeof JOB_TYPES)[number];
export type IndicatorStatus = (typeof INDICATOR_STATUSES)[number];

/** Roles that must pass a TOTP step at login (NFR-SEC-02, API_CONTRACTS §1). */
export const TOTP_ROLES: readonly Role[] = ["NHAA_SUPERVISOR", "STATE_ADMIN", "MINISTRY_ADMIN", "SYS_ADMIN", "AUDITOR"];
