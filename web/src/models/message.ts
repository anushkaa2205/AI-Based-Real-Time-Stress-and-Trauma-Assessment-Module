/** `messages` collection (split from docs/models.ts, task 1.2). */
import { Schema } from "mongoose";
import { getModel, ObjectId, appendOnly } from "./_shared";
import { MESSAGE_SENDERS, MESSAGE_MODALITIES } from "./enums";

const MessageSchema = new Schema(
  {
    interactionId: { type: ObjectId, ref: "Interaction", required: true },
    seq: { type: Number, required: true },
    sender: { type: String, enum: MESSAGE_SENDERS, required: true },
    modality: { type: String, enum: MESSAGE_MODALITIES, required: true },
    textEnc: { type: String, required: true },
    translationEnc: String, // EN/HI for responders (FR-LANG-06)
    // Added in task 4.8 (not yet in DATABASE.md): text emotion for the emotion timeline (FR-EMO-01/03)
    emotion: { label: String, confidence: Number },
    language: String,
    sttConfidence: Number,
    idempotencyKey: String,
    purgeAt: Date, // TTL: automatic deletion after retention period
  },
  appendOnly,
);
MessageSchema.index({ interactionId: 1, seq: 1 }, { unique: true });
MessageSchema.index(
  { interactionId: 1, idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $type: "string" } } },
);
MessageSchema.index({ purgeAt: 1 }, { expireAfterSeconds: 0 }); // NFR-PRI-04

export const Message = getModel("Message", MessageSchema, "messages");
