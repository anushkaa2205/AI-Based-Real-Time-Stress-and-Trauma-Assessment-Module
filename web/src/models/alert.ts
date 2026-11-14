/** `alerts` collection (split from docs/models.ts, task 1.2). */
import { Schema } from "mongoose";
import { getModel, ObjectId, base } from "./_shared";
import { ALERT_LEVELS, ALERT_STATUSES } from "./enums";

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

export const Alert = getModel("Alert", AlertSchema, "alerts");
