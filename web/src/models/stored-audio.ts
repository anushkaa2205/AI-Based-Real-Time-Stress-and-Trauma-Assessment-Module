/** `stored_audio` collection (split from docs/models.ts, task 1.2). */
import { Schema } from "mongoose";
import { getModel, ObjectId, appendOnly } from "./_shared";

/** Only when the victim consented to audio retention (FR-VOI-09) */
const StoredAudioSchema = new Schema(
  {
    interactionId: { type: ObjectId, ref: "Interaction", required: true, index: true },
    storageKey: { type: String, required: true }, // object storage key; file encrypted
    durationMs: { type: Number, required: true },
    deleteAfter: { type: Date, required: true },
  },
  appendOnly,
);
// The worker deletes the object first, then the document (TTL would orphan the file)
StoredAudioSchema.index({ deleteAfter: 1 });

export const StoredAudio = getModel("StoredAudio", StoredAudioSchema, "stored_audio");
