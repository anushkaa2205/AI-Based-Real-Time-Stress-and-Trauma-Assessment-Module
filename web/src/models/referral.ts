/** `referrals` collection (split from docs/models.ts, task 1.2). */
import { Schema } from "mongoose";
import { getModel, ObjectId, base } from "./_shared";
import { ROLES, SUPPORT_TYPES, URGENCIES, REFERRAL_STATUSES } from "./enums";

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
    isPortal: { type: Boolean, default: false }, // M.7: copied from the case at creation
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

export const Referral = getModel("Referral", ReferralSchema, "referrals");
