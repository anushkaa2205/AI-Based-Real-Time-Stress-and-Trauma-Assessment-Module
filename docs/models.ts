/**
 * NHAA Stress & Trauma Assessment Module: MongoDB data model (Mongoose 9)
 *
 * In the app this file is split into src/models/<name>.ts; it is kept as one
 * file here so the whole data model can be reviewed in one place.
 *
 * Conventions
 *  - Requirement IDs (FR-…, NFR-…) refer to REQUIREMENTS.md
 *  - Fields ending in `Enc` hold application-level AES-256-GCM ciphertext
 *    ("enc:v1:<keyId>:<iv>:<tag>:<data>"). Never queried by value.
 *  - Victim personal identifiers live ONLY in the `subject_identities`
 *    collection (separate database in production)               (NFR-PRI-03)
 *  - Requires a replica set (multi-document transactions)
 *  - All dates are stored as UTC Date
 */
import mongoose, { Schema, model, type InferSchemaType, type Model, Types } from "mongoose";

const { ObjectId } = Schema.Types;

// ============================================================================
// Enums (shared with Zod contracts in src/contracts)
// ============================================================================

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
/** VICTIM is scored; OPERATOR (chatbot or operator turns) is context only; SYSTEM is legacy (no longer written). */
export const MESSAGE_MODALITIES = ["TEXT", "VOICE_TRANSCRIPT"] as const; // IVR_KEYPRESS removed 16 Nov 2026

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

export const SIGNAL_SOURCES = ["TEXT_NLP", "SAFETY_LEXICON", "VOICE", "CONTEXT"] as const; // SCREENER removed (config v3)
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
export const ACTOR_TYPES = ["USER", "VICTIM_SESSION", "API_CLIENT", "SYSTEM"] as const;
export const JOB_TYPES = ["alert.escalate", "followup.remind", "retention.purge", "rescore", "stats.rollup"] as const;

// Shared options: createdAt/updatedAt, no __v noise in API output
const base = { timestamps: true, versionKey: false } as const;
const appendOnly = { timestamps: { createdAt: true, updatedAt: false }, versionKey: false } as const;

/** Prevents "OverwriteModelError" during Next.js hot reload */
function getModel<T extends Schema>(name: string, schema: T, collection: string) {
  return (mongoose.models[name] as Model<InferSchemaType<T>>) ?? model(name, schema, collection);
}

// ============================================================================
// 1. Geography: states, districts
// ============================================================================

const StateSchema = new Schema(
  {
    code: { type: String, required: true, unique: true }, // "MH"
    name: { type: String, required: true },
  },
  base,
);

const DistrictSchema = new Schema(
  {
    stateId: { type: ObjectId, ref: "State", required: true, index: true },
    code: { type: String, required: true, unique: true }, // LGD code
    name: { type: String, required: true },
  },
  base,
);

// ============================================================================
// 2. Staff users and API clients
// ============================================================================

const UserSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, required: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ROLES, required: true },
    stateId: { type: ObjectId, ref: "State" },
    districtId: { type: ObjectId, ref: "District" },
    languages: { type: [String], default: [] }, // for assignment (FR-CASE-02)
    totpSecretEnc: { type: String, select: false }, // NFR-SEC-02
    isActive: { type: Boolean, default: true },
    isOnDuty: { type: Boolean, default: false }, // alert routing (FR-ALR-01)
    openCaseCount: { type: Number, default: 0 }, // workload for auto-assignment
    lastLoginAt: Date,
  },
  base,
);
UserSchema.index({ role: 1, districtId: 1, isOnDuty: 1 });

const ApiClientSchema = new Schema(
  {
    name: { type: String, required: true },
    keyPrefix: { type: String, required: true, unique: true },
    keyHash: { type: String, required: true, select: false }, // FR-API-02
    scopes: { type: [String], default: [] }, // "interactions:write", "assessments:read", …
    rateLimitPerMin: { type: Number, default: 120 },
    isActive: { type: Boolean, default: true },
    isDemo: { type: Boolean, default: false }, // the demo input layer's client (task M.7)
  },
  base,
);

// ============================================================================
// 3. Victim: pseudonymous subject + separated identity vault (NFR-PRI-03)
// ============================================================================

/** Pseudonymous person. Every other collection references only this _id. */
const SubjectSchema = new Schema({}, appendOnly);

/**
 * PII vault. In production this model is bound to a separate database
 * connection (e.g. `nhaa_pii`) with its own credentials and encryption key.
 */
const SubjectIdentitySchema = new Schema(
  {
    _id: { type: ObjectId, ref: "Subject" }, // same _id as the Subject
    fullNameEnc: String,
    phoneEnc: String,
    phoneHash: { type: String, index: true }, // HMAC, for de-duplication without decrypting
    addressEnc: String,
  },
  base,
);

// ============================================================================
// 4. Case (= one docket number)
// ============================================================================

const BandOverrideSchema = new Schema(
  {
    fromBand: { type: String, enum: RISK_BANDS, required: true },
    toBand: { type: String, enum: RISK_BANDS, required: true },
    reason: { type: String, required: true, minlength: 5 }, // FR-CASE-04
    byUserId: { type: ObjectId, ref: "User", required: true },
    at: { type: Date, default: Date.now },
  },
  { _id: true },
);

const CaseSchema = new Schema(
  {
    docketNumber: { type: String, required: true, unique: true },
    subjectId: { type: ObjectId, ref: "Subject", required: true, index: true },
    stateId: { type: ObjectId, ref: "State" },
    districtId: { type: ObjectId, ref: "District" },
    status: { type: String, enum: CASE_STATUSES, default: "NEW" },
    assignedCounsellorId: { type: ObjectId, ref: "User" },

    // Denormalised from the latest assessment, for queue sorting (FR-CASE-01)
    currentBand: { type: String, enum: RISK_BANDS },
    bandRank: { type: Number, default: 0 }, // CRITICAL=4 … LOW=1, 0 = not assessed
    currentSvi: { type: Number, min: 0, max: 100 },
    latestAssessmentId: { type: ObjectId, ref: "Assessment" },
    overrideLockedBand: { type: String, enum: RISK_BANDS }, // FR-RISK-03: AI cannot go below this
    waitingSince: { type: Date, default: Date.now }, // reset when a responder acts
    limitedConfidence: { type: Boolean, default: false },
    isDemo: { type: Boolean, default: false }, // M.7: created by the demo input layer's key (server-side only)

    summaryEnc: String, // neutral case summary (FR-NLP-09)
    summaryTranslatedEnc: String,

    // Bounded history, so embedded (a handful per case)
    bandOverrides: { type: [BandOverrideSchema], default: [] },

    firstContactAt: { type: Date, default: Date.now },
    lastActivityAt: { type: Date, default: Date.now },
    closedAt: Date,
  },
  base,
);
// Risk-sorted queue: band desc, SVI desc, longest waiting first
CaseSchema.index({ status: 1, bandRank: -1, currentSvi: -1, waitingSince: 1 });
CaseSchema.index({ districtId: 1, status: 1, bandRank: -1 });
CaseSchema.index({ assignedCounsellorId: 1, status: 1 });

// ============================================================================
// 5. Interaction (= one contact session)
//    Small, bounded data is embedded: context, consents
// ============================================================================

/** Optional context for EXTREME_VULNERABILITY (FR-CH-08, FR-IND-02).
 *  Deliberately NO caste/community field (C-ETH-03). */
const CaseContextSchema = new Schema(
  {
    offenceCategory: String, // code from the NHAA grievance list
    isSexualOffence: Boolean,
    familyMemberKilled: Boolean,
    ageGroup: { type: String, enum: ["UNDER_18", "18_59", "60_PLUS"] },
    isMinor: Boolean,
    gender: String,
    hasDisability: Boolean,
    supportPersonPresent: Boolean,
    accusedNearby: Boolean,
    ongoingThreats: Boolean,
    pressureToWithdraw: Boolean,
    displaced: Boolean,
    economicDependence: Boolean,
    repeatVictimisation: Boolean,
    updatedAt: Date,
  },
  { _id: false },
);

/** Append-only consent ledger entry (FR-CON-01…06) */
const ConsentEntrySchema = new Schema(
  {
    action: { type: String, enum: CONSENT_ACTIONS, required: true },
    noticeVersion: { type: String, required: true },
    language: { type: String, required: true },
    textAnalysis: { type: Boolean, required: true },
    voiceAnalysis: { type: Boolean, required: true },
    shareWithCounsellor: { type: Boolean, required: true },
    followUpContact: { type: Boolean, required: true },
    audioRetention: { type: Boolean, default: false },
    guardianConsent: Boolean, // FR-CON-05
    at: { type: Date, default: Date.now },
  },
  { _id: true },
);

/** Copy of the latest assessment's headline values, for fast reads */
const AssessmentHeadSchema = new Schema(
  {
    assessmentId: { type: ObjectId, ref: "Assessment" },
    svi: Number,
    band: { type: String, enum: RISK_BANDS },
    confidence: Number,
    at: Date,
  },
  { _id: false },
);

const InteractionSchema = new Schema(
  {
    caseId: { type: ObjectId, ref: "Case", required: true, index: true },
    subjectId: { type: ObjectId, ref: "Subject", required: true },
    channel: { type: String, enum: CHANNELS, required: true },
    status: { type: String, enum: INTERACTION_STATUSES, default: "ACTIVE" },
    mode: { type: String, enum: ASSESSMENT_MODES, default: "SAFETY_ONLY" },
    uiLanguage: { type: String, required: true }, // BCP-47: "hi", "en", "mr", …
    detectedLanguages: { type: [String], default: [] },
    districtId: { type: ObjectId, ref: "District" },
    operatorId: { type: ObjectId, ref: "User" },
    apiClientId: { type: ObjectId, ref: "ApiClient" },

    // Counters for ordered child documents (incremented atomically with $inc)
    messageSeq: { type: Number, default: 0 },
    assessmentSeq: { type: Number, default: 0 },

    voiceBaseline: { type: Schema.Types.Mixed }, // speaker baseline (FR-VOI-03), caller speech only
    speakerStateEnc: { type: String, select: false }, // M.10: encrypted voice fingerprints of a MIXED call; biometric, deleted at the end
    voiceUnseparated: { type: Boolean, default: false }, // M.10: a MIXED window was not separated with confidence → limited confidence
    isDemo: { type: Boolean, default: false }, // M.7: copied from the API client at start

    context: { type: CaseContextSchema, default: () => ({}) },
    consents: { type: [ConsentEntrySchema], default: [] },
    current: { type: AssessmentHeadSchema },

    startedAt: { type: Date, default: Date.now },
    endedAt: Date,
    retentionUntil: Date, // NFR-PRI-04
  },
  base,
);
InteractionSchema.index({ status: 1, startedAt: -1 });

// ============================================================================
// 6. Raw signals: messages, voice windows, stored audio
// ============================================================================

const MessageSchema = new Schema(
  {
    interactionId: { type: ObjectId, ref: "Interaction", required: true },
    seq: { type: Number, required: true },
    sender: { type: String, enum: MESSAGE_SENDERS, required: true },
    modality: { type: String, enum: MESSAGE_MODALITIES, required: true },
    textEnc: { type: String, required: true },
    translationEnc: String, // EN/HI for responders (FR-LANG-06)
    language: String,
    sttConfidence: Number,
    idempotencyKey: String,
    purgeAt: Date, // TTL: automatic deletion after retention period
  },
  appendOnly,
);
MessageSchema.index({ interactionId: 1, seq: 1 }, { unique: true });
MessageSchema.index(
  { interactionId: 1, idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $type: "string" } } },
);
MessageSchema.index({ purgeAt: 1 }, { expireAfterSeconds: 0 }); // NFR-PRI-04

const AudioEventSchema = new Schema(
  {
    type: { type: String, enum: ["CRYING", "SOBBING", "SIGH", "LONG_SILENCE", "SHARP_BREATH"], required: true },
    startMs: Number,
    endMs: Number,
    confidence: Number,
  },
  { _id: false },
);

/** Acoustic features per rolling window (FR-VOI-02…07). No raw audio. */
const VoiceWindowSchema = new Schema(
  {
    interactionId: { type: ObjectId, ref: "Interaction", required: true },
    messageId: { type: ObjectId, ref: "Message" }, // transcript of this window
    windowIndex: { type: Number, required: true },
    startMs: { type: Number, required: true },
    endMs: { type: Number, required: true },
    pauses: {
      count: { type: Number, required: true },
      meanMs: { type: Number, required: true },
      maxMs: { type: Number, required: true },
      silenceRatio: { type: Number, required: true },
    },
    pitch: { meanHz: Number, stdHz: Number, rangeHz: Number },
    speechRateWpm: Number,
    energy: { meanDb: Number, deltaDb: Number },
    voiceQuality: { jitter: Number, shimmer: Number },
    events: { type: [AudioEventSchema], default: [] },
    baselineDeviation: { type: Schema.Types.Mixed }, // z-scores vs speaker baseline
    emotion: {
      label: String, // fear | sadness | anger | neutral | flat
      confidence: Number,
      distribution: { type: Schema.Types.Mixed },
    },
    modelVersion: { type: String, required: true },
    purgeAt: Date,
  },
  appendOnly,
);
VoiceWindowSchema.index({ interactionId: 1, windowIndex: 1 }, { unique: true });
VoiceWindowSchema.index({ purgeAt: 1 }, { expireAfterSeconds: 0 });

/** Only when the victim consented to audio retention (FR-VOI-09) */
const StoredAudioSchema = new Schema(
  {
    interactionId: { type: ObjectId, ref: "Interaction", required: true, index: true },
    storageKey: { type: String, required: true }, // object storage key; file encrypted
    durationMs: { type: Number, required: true },
    deleteAfter: { type: Date, required: true },
  },
  appendOnly,
);
// The worker deletes the object first, then the document (TTL would orphan the file)
StoredAudioSchema.index({ deleteAfter: 1 });

// ============================================================================
// 7. Derived signals: indicators, assessments (SVI), scoring configs
// ============================================================================

const IndicatorSchema = new Schema(
  {
    interactionId: { type: ObjectId, ref: "Interaction", required: true },
    caseId: { type: ObjectId, ref: "Case", required: true },
    dimension: { type: String, enum: DIMENSIONS, required: true },
    source: { type: String, enum: SIGNAL_SOURCES, required: true },
    score: { type: Number, min: 0, max: 1, required: true },
    confidence: { type: Number, min: 0, max: 1, required: true },
    evidence: {
      type: { type: String, enum: EVIDENCE_TYPES, required: true },
      messageId: { type: ObjectId, ref: "Message" }, // TEXT_SPAN
      spanStart: Number,
      spanEnd: Number,
      quoteEnc: String, // exact substring, verified (AC-NLP-05)
      voiceWindowId: { type: ObjectId, ref: "VoiceWindow" }, // ACOUSTIC_EVENT
      eventType: String,
      contextField: String, // CONTEXT_FIELD
    },
    negated: { type: Boolean, default: false }, // FR-NLP-08: kept for audit, not scored
    modelVersion: { type: String, required: true },

    status: { type: String, enum: INDICATOR_STATUSES, default: "ACTIVE" },
    review: {
      score: Number,
      reason: String,
      byUserId: { type: ObjectId, ref: "User" },
      at: Date,
    },
  },
  base,
);
IndicatorSchema.index({ interactionId: 1, dimension: 1, status: 1 });
IndicatorSchema.index({ caseId: 1, createdAt: -1 });

const DimensionScoreSchema = new Schema(
  {
    score: { type: Number, min: 0, max: 1, required: true },
    confidence: { type: Number, min: 0, max: 1, required: true },
    bySource: { type: Schema.Types.Mixed }, // { TEXT_NLP: 0.8, VOICE: 0.4, … }
    contribution: { type: Number, required: true }, // points added to the SVI
  },
  { _id: false },
);

/** Immutable SVI snapshot, one per re-score (FR-SVI-05) */
const AssessmentSchema = new Schema(
  {
    interactionId: { type: ObjectId, ref: "Interaction", required: true },
    caseId: { type: ObjectId, ref: "Case", required: true },
    seq: { type: Number, required: true },
    trigger: { type: String, enum: ASSESSMENT_TRIGGERS, required: true },
    svi: { type: Number, min: 0, max: 100, required: true },
    computedBand: { type: String, enum: RISK_BANDS, required: true }, // thresholds only
    band: { type: String, enum: RISK_BANDS, required: true }, // after overrides
    overridesFired: { type: [String], default: [] }, // ["OV-1", …]
    dimensions: {
      // one entry per dimension, contributions sum to svi ±1 (AC-SVI-03)
      type: Map,
      of: DimensionScoreSchema,
      required: true,
    },
    confidence: { type: Number, min: 0, max: 1, required: true }, // FR-SVI-04
    limitedConfidence: { type: Boolean, default: false }, // NFR-REL-01 fallback
    topEvidence: [
      {
        _id: false,
        indicatorId: { type: ObjectId, ref: "Indicator" },
        dimension: { type: String, enum: DIMENSIONS },
        label: String,
      },
    ],
    explanation: { type: String, required: true }, // FR-RISK-04
    configVersion: { type: Number, required: true },
    modelVersions: { type: Schema.Types.Mixed },
  },
  appendOnly,
);
AssessmentSchema.index({ interactionId: 1, seq: 1 }, { unique: true });
AssessmentSchema.index({ caseId: 1, createdAt: -1 });

/** Versioned weights, thresholds and rules (FR-SVI-06, FR-SVI-07) */
const ScoringConfigSchema = new Schema(
  {
    version: { type: Number, required: true, unique: true },
    dimensionWeights: { type: Map, of: Number, required: true }, // must sum to 1
    sourceWeights: { type: Map, of: Number, required: true },
    voiceOnlyCap: { type: Number, default: 0.6 }, // FR-VOI-08
    bandThresholds: {
      moderate: { type: Number, required: true },
      high: { type: Number, required: true },
      critical: { type: Number, required: true },
    },
    safetyOverrides: { type: Schema.Types.Mixed, required: true }, // REQUIREMENTS Appendix B
    recommendationRules: { type: Schema.Types.Mixed, required: true }, // Appendix C
    alertPolicy: {
      criticalAckTimeoutSec: { type: Number, default: 120 },
      escalationChain: { type: [String], default: ["COUNSELLOR", "NHAA_SUPERVISOR", "DISTRICT_OFFICER"] },
    },
    isActive: { type: Boolean, default: false },
    notes: String,
    createdById: { type: ObjectId, ref: "User", required: true },
  },
  appendOnly,
);
// At most one active config
ScoringConfigSchema.index({ isActive: 1 }, { unique: true, partialFilterExpression: { isActive: true } });

// ============================================================================
// 8. Responses: notes, recommendations, referrals, alerts, follow-ups
// ============================================================================

const CaseNoteSchema = new Schema(
  {
    caseId: { type: ObjectId, ref: "Case", required: true },
    authorId: { type: ObjectId, ref: "User", required: true },
    bodyEnc: { type: String, required: true },
  },
  appendOnly,
);
CaseNoteSchema.index({ caseId: 1, createdAt: -1 });

const RecommendationSchema = new Schema(
  {
    caseId: { type: ObjectId, ref: "Case", required: true },
    interactionId: { type: ObjectId, ref: "Interaction", required: true },
    assessmentId: { type: ObjectId, ref: "Assessment", required: true },
    type: { type: String, enum: SUPPORT_TYPES, required: true },
    ruleId: { type: String, required: true }, // "REC-INTIMIDATION-HIGH"
    reason: { type: String, required: true }, // FR-REC-03
    urgency: { type: String, enum: URGENCIES, required: true },
    dueAt: Date,
    responsibleRole: { type: String, enum: ROLES, required: true },
    legalBasis: String, // FR-REC-04
    status: { type: String, enum: RECOMMENDATION_STATUSES, default: "PROPOSED" },
    decision: {
      byUserId: { type: ObjectId, ref: "User" },
      at: Date,
      reason: String,
    },
    postReviewedAt: Date, // AUTO_TRIGGERED must be reviewed afterwards (FR-REC-05)
    referralId: { type: ObjectId, ref: "Referral" },
  },
  base,
);
RecommendationSchema.index({ caseId: 1, type: 1, status: 1 });
RecommendationSchema.index({ status: 1, responsibleRole: 1, dueAt: 1 });

/**
 * What external stakeholders see: minimal and action-only (FR-DSH-04, C-ETH-02).
 * Kept in its own collection so police/welfare queries never touch case content.
 */
const ReferralSchema = new Schema(
  {
    recommendationId: { type: ObjectId, ref: "Recommendation", required: true, unique: true },
    caseId: { type: ObjectId, ref: "Case", required: true },
    docketNumber: { type: String, required: true },
    type: { type: String, enum: SUPPORT_TYPES, required: true },
    targetRole: { type: String, enum: ROLES, required: true },
    districtId: { type: ObjectId, ref: "District" },
    assignedToId: { type: ObjectId, ref: "User" },
    actionRequested: { type: String, required: true }, // "Protection visit today"
    locationHint: String, // village/ward, never full address
    contactRoute: { type: String, required: true }, // "Via NHAA desk, ref <docket>"
    urgency: { type: String, enum: URGENCIES, required: true },
    dueAt: Date,
    status: { type: String, enum: REFERRAL_STATUSES, default: "PENDING" },
    outcomeNote: String,
    declinedReason: String,
    history: [
      {
        _id: false,
        status: { type: String, enum: REFERRAL_STATUSES },
        byUserId: { type: ObjectId, ref: "User" },
        at: { type: Date, default: Date.now },
      },
    ],
  },
  base,
);
ReferralSchema.index({ targetRole: 1, districtId: 1, status: 1, dueAt: 1 });

const AlertSchema = new Schema(
  {
    caseId: { type: ObjectId, ref: "Case", required: true, index: true },
    interactionId: { type: ObjectId, ref: "Interaction" },
    level: { type: String, enum: ALERT_LEVELS, required: true },
    reason: { type: String, required: true },
    status: { type: String, enum: ALERT_STATUSES, default: "OPEN" },
    escalationLevel: { type: Number, default: 0 }, // 0 on-duty counsellors, 1 supervisor, 2 district
    escalateAt: Date, // FR-ALR-03
    acknowledgedById: { type: ObjectId, ref: "User" },
    acknowledgedAt: Date, // FR-ALR-02
    resolvedAt: Date,
  },
  base,
);
AlertSchema.index({ status: 1, escalateAt: 1 });
// Only one open alert per case and level
AlertSchema.index({ caseId: 1, level: 1 }, { unique: true, partialFilterExpression: { status: "OPEN" } });

/** Hook for SIH26094 continuous monitoring (FR-REC-09) */
const FollowUpSchema = new Schema(
  {
    caseId: { type: ObjectId, ref: "Case", required: true, index: true },
    dueAt: { type: Date, required: true },
    channel: { type: String, enum: CHANNELS, required: true },
    status: { type: String, enum: FOLLOW_UP_STATUSES, default: "SCHEDULED" },
    assignedToId: { type: ObjectId, ref: "User" },
    outcomeNote: String,
  },
  base,
);
FollowUpSchema.index({ status: 1, dueAt: 1 });

// ============================================================================
// 9. Audit log: append-only, hash-chained, no victim content (FR-AUD-01…03)
// ============================================================================

const AuditLogSchema = new Schema(
  {
    actorType: { type: String, enum: ACTOR_TYPES, required: true },
    actorId: String, // user / api client id, null for SYSTEM
    action: { type: String, required: true }, // "case.view", "indicator.review", "consent.withdraw", …
    entityType: { type: String, required: true },
    entityId: { type: String, required: true },
    metadata: { type: Schema.Types.Mixed }, // ids, versions, counts: never message text
    ipHash: String,
    prevHash: { type: String, required: true, unique: true }, // unique ⇒ the chain cannot fork
    hash: { type: String, required: true, unique: true }, // sha256(prevHash + canonical(entry))
  },
  appendOnly,
);
AuditLogSchema.index({ entityType: 1, entityId: 1, createdAt: -1 });
AuditLogSchema.index({ actorId: 1, createdAt: -1 });

// ============================================================================
// 10. Jobs (escalations, retention, follow-ups, re-scoring, stats)
// ============================================================================

const JobSchema = new Schema(
  {
    type: { type: String, enum: JOB_TYPES, required: true },
    payload: { type: Schema.Types.Mixed, required: true },
    runAt: { type: Date, required: true },
    attempts: { type: Number, default: 0 },
    lockedUntil: Date,
    doneAt: Date,
    lastError: String,
    cleanupAt: Date, // TTL for finished jobs
  },
  base,
);
JobSchema.index({ doneAt: 1, runAt: 1 });
JobSchema.index({ cleanupAt: 1 }, { expireAfterSeconds: 0 });

// ============================================================================
// 11. Analytics roll-up (anonymised; written by the worker with $merge)
// ============================================================================

const DailyStatSchema = new Schema(
  {
    day: { type: Date, required: true },
    stateId: { type: ObjectId, ref: "State" },
    districtId: { type: ObjectId, ref: "District" },
    channel: { type: String, enum: CHANNELS },
    language: String,
    band: { type: String, enum: RISK_BANDS },
    isDemo: { type: Boolean, default: false }, // M.7
    interactions: { type: Number, default: 0 },
    criticalAlerts: { type: Number, default: 0 },
    medianAckSec: Number,
    medianFirstResponseSec: Number,
    referralsCreated: { type: Map, of: Number }, // by support type
    referralsDone: { type: Map, of: Number },
  },
  { versionKey: false },
);
DailyStatSchema.index({ day: 1, stateId: 1, districtId: 1, channel: 1, language: 1, band: 1, isDemo: 1 }, { unique: true });

// ============================================================================
// Models
// ============================================================================

export const State = getModel("State", StateSchema, "states");
export const District = getModel("District", DistrictSchema, "districts");
export const User = getModel("User", UserSchema, "users");
export const ApiClient = getModel("ApiClient", ApiClientSchema, "api_clients");
export const Subject = getModel("Subject", SubjectSchema, "subjects");
export const SubjectIdentity = getModel("SubjectIdentity", SubjectIdentitySchema, "subject_identities");
export const Case = getModel("Case", CaseSchema, "cases");
export const Interaction = getModel("Interaction", InteractionSchema, "interactions");
export const Message = getModel("Message", MessageSchema, "messages");
export const VoiceWindow = getModel("VoiceWindow", VoiceWindowSchema, "voice_windows");
export const StoredAudio = getModel("StoredAudio", StoredAudioSchema, "stored_audio");
export const Indicator = getModel("Indicator", IndicatorSchema, "indicators");
export const Assessment = getModel("Assessment", AssessmentSchema, "assessments");
export const ScoringConfig = getModel("ScoringConfig", ScoringConfigSchema, "scoring_configs");
export const CaseNote = getModel("CaseNote", CaseNoteSchema, "case_notes");
export const Recommendation = getModel("Recommendation", RecommendationSchema, "recommendations");
export const Referral = getModel("Referral", ReferralSchema, "referrals");
export const Alert = getModel("Alert", AlertSchema, "alerts");
export const FollowUp = getModel("FollowUp", FollowUpSchema, "follow_ups");
export const AuditLog = getModel("AuditLog", AuditLogSchema, "audit_logs");
export const Job = getModel("Job", JobSchema, "jobs");
export const DailyStat = getModel("DailyStat", DailyStatSchema, "daily_stats");

// Handy inferred document types
export type CaseDoc = InferSchemaType<typeof CaseSchema> & { _id: Types.ObjectId };
export type InteractionDoc = InferSchemaType<typeof InteractionSchema> & { _id: Types.ObjectId };
export type IndicatorDoc = InferSchemaType<typeof IndicatorSchema> & { _id: Types.ObjectId };
export type AssessmentDoc = InferSchemaType<typeof AssessmentSchema> & { _id: Types.ObjectId };
