/** `cases` collection (split from docs/models.ts, task 1.2). */
import { Schema, type InferSchemaType, type Types } from "mongoose";
import { getModel, ObjectId, base } from "./_shared";
import { RISK_BANDS, CASE_STATUSES } from "./enums";

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

export const Case = getModel("Case", CaseSchema, "cases");
export type CaseDoc = InferSchemaType<typeof CaseSchema> & { _id: Types.ObjectId };
