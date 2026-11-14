/** `follow_ups` collection (split from docs/models.ts, task 1.2). */
import { Schema } from "mongoose";
import { getModel, ObjectId, base } from "./_shared";
import { CHANNELS, FOLLOW_UP_STATUSES } from "./enums";

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

export const FollowUp = getModel("FollowUp", FollowUpSchema, "follow_ups");
