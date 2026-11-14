/** `users` collection (split from docs/models.ts, task 1.2). */
import { Schema } from "mongoose";
import { getModel, ObjectId, base } from "./_shared";
import { ROLES } from "./enums";

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

export const User = getModel("User", UserSchema, "users");
