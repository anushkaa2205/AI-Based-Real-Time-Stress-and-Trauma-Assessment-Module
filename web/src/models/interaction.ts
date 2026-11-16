/** `interactions` collection (split from docs/models.ts, task 1.2). */
import { Schema, type InferSchemaType, type Types } from "mongoose";
import { getModel, ObjectId, base } from "./_shared";
import { CHANNELS, INTERACTION_STATUSES, ASSESSMENT_MODES, CONSENT_ACTIONS, RISK_BANDS } from "./enums";

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

// Removed 16 Nov 2026 (task M.2): sessionTokenHash, sessionExpiresAt, flowState, screenerResponses,
// screenerScores. scripts/drop-screener-data.ts clears them from older synthetic documents.
const InteractionSchema = new Schema(
  {
    caseId: { type: ObjectId, ref: "Case", required: true, index: true },
    subjectId: { type: ObjectId, ref: "Subject", required: true },
    channel: { type: String, enum: CHANNELS, required: true },
    status: { type: String, enum: INTERACTION_STATUSES, default: "ACTIVE" },
    mode: { type: String, enum: ASSESSMENT_MODES, default: "SAFETY_ONLY" },
    uiLanguage: { type: String, required: true }, // BCP-47: "hi", "en", "mr", …
    detectedLanguages: { type: [String], default: [] },
    // Added in Phase 5 (not yet in DATABASE.md): facts found in earlier messages that drive
    // recommendations, e.g. COMPLAINT_NOT_REGISTERED → legal aid. Codes only, never text.
    caseFacts: { type: [String], default: [] },
    districtId: { type: ObjectId, ref: "District" },
    operatorId: { type: ObjectId, ref: "User" },
    // Added in task 8.4 (not yet in DATABASE.md): the integrating system's own reference
    externalRef: String,
    apiClientId: { type: ObjectId, ref: "ApiClient" },

    // Counters for ordered child documents (incremented atomically with $inc)
    messageSeq: { type: Number, default: 0 },
    assessmentSeq: { type: Number, default: 0 },

    voiceBaseline: { type: Schema.Types.Mixed }, // speaker baseline (FR-VOI-03), caller speech only
    speakerStateEnc: { type: String, select: false }, // M.10: encrypted voice fingerprints of a MIXED call; biometric, deleted at the end
    voiceUnseparated: { type: Boolean, default: false }, // M.10: a MIXED window was not separated with confidence → limited confidence

    context: { type: CaseContextSchema, default: () => ({}) },
    consents: { type: [ConsentEntrySchema], default: [] },
    current: { type: AssessmentHeadSchema },

    startedAt: { type: Date, default: Date.now },
    endedAt: Date,
    retentionUntil: Date, // NFR-PRI-04
    // Added in task 8.7 (not yet in DATABASE.md): when the retention job cleared its evidence quotes
    contentPurgedAt: Date,
  },
  base,
);
InteractionSchema.index({ status: 1, startedAt: -1 });

export const Interaction = getModel("Interaction", InteractionSchema, "interactions");
export type InteractionDoc = InferSchemaType<typeof InteractionSchema> & { _id: Types.ObjectId };
