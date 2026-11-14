/** `audit_logs` collection (split from docs/models.ts, task 1.2). */
import { Schema } from "mongoose";
import { getModel, appendOnly } from "./_shared";
import { ACTOR_TYPES } from "./enums";

const AuditLogSchema = new Schema(
  {
    actorType: { type: String, enum: ACTOR_TYPES, required: true },
    actorId: String, // user / api client id, null for SYSTEM
    action: { type: String, required: true }, // "case.view", "indicator.review", "consent.withdraw", …
    entityType: { type: String, required: true },
    entityId: { type: String, required: true },
    metadata: { type: Schema.Types.Mixed }, // ids, versions, counts: never message text
    ipHash: String,
    prevHash: { type: String, required: true, unique: true }, // unique ⇒ the chain cannot fork
    hash: { type: String, required: true, unique: true }, // sha256(prevHash + canonical(entry))
  },
  appendOnly,
);
AuditLogSchema.index({ entityType: 1, entityId: 1, createdAt: -1 });
AuditLogSchema.index({ actorId: 1, createdAt: -1 });

export const AuditLog = getModel("AuditLog", AuditLogSchema, "audit_logs");
