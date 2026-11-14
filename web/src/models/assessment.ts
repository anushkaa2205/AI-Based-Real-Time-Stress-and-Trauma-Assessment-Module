/** `assessments` collection (split from docs/models.ts, task 1.2). */
import { Schema, type InferSchemaType, type Types } from "mongoose";
import { getModel, ObjectId, appendOnly } from "./_shared";
import { DIMENSIONS, RISK_BANDS, ASSESSMENT_TRIGGERS } from "./enums";

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

export const Assessment = getModel("Assessment", AssessmentSchema, "assessments");
export type AssessmentDoc = InferSchemaType<typeof AssessmentSchema> & { _id: Types.ObjectId };
