/** `recommendations` collection (split from docs/models.ts, task 1.2). */
import { Schema } from "mongoose";
import { getModel, ObjectId, base } from "./_shared";
import { ROLES, SUPPORT_TYPES, URGENCIES, RECOMMENDATION_STATUSES } from "./enums";

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

export const Recommendation = getModel("Recommendation", RecommendationSchema, "recommendations");
