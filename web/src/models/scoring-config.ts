/** `scoring_configs` collection (split from docs/models.ts, task 1.2). */
import { Schema } from "mongoose";
import { getModel, ObjectId, appendOnly } from "./_shared";

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

export const ScoringConfig = getModel("ScoringConfig", ScoringConfigSchema, "scoring_configs");
