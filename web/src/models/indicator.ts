/** `indicators` collection (split from docs/models.ts, task 1.2). */
import { Schema, type InferSchemaType, type Types } from "mongoose";
import { getModel, ObjectId, base } from "./_shared";
import { DIMENSIONS, SIGNAL_SOURCES, EVIDENCE_TYPES, INDICATOR_STATUSES } from "./enums";

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
    // Added in task 3.5 (not yet in DATABASE.md): override facts this signal carries
    // (e.g. ACCUSED_PRESENT → OV-2) and a short staff-facing label. Never victim text.
    flags: { type: [String], default: [] },
    label: String,
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

export const Indicator = getModel("Indicator", IndicatorSchema, "indicators");
export type IndicatorDoc = InferSchemaType<typeof IndicatorSchema> & { _id: Types.ObjectId };
