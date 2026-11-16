/** `voice_windows` collection (split from docs/models.ts, task 1.2). */
import { Schema } from "mongoose";
import { getModel, ObjectId, appendOnly } from "./_shared";

const AudioEventSchema = new Schema(
  {
    type: { type: String, enum: ["CRYING", "SOBBING", "SIGH", "LONG_SILENCE", "SHARP_BREATH"], required: true },
    startMs: Number,
    endMs: Number,
    confidence: Number,
  },
  { _id: false },
);

/** Acoustic features per rolling window (FR-VOI-02…07). No raw audio. */
const VoiceWindowSchema = new Schema(
  {
    interactionId: { type: ObjectId, ref: "Interaction", required: true },
    messageId: { type: ObjectId, ref: "Message" }, // transcript of this window
    windowIndex: { type: Number, required: true },
    startMs: { type: Number, required: true },
    endMs: { type: Number, required: true },
    pauses: {
      count: { type: Number, required: true },
      meanMs: { type: Number, required: true },
      maxMs: { type: Number, required: true },
      silenceRatio: { type: Number, required: true },
    },
    pitch: { meanHz: Number, stdHz: Number, rangeHz: Number },
    speechRateWpm: Number,
    energy: { meanDb: Number, deltaDb: Number },
    voiceQuality: { jitter: Number, shimmer: Number },
    events: { type: [AudioEventSchema], default: [] },
    baselineDeviation: { type: Schema.Types.Mixed }, // z-scores vs speaker baseline
    emotion: {
      label: String, // fear | sadness | anger | neutral | flat
      confidence: Number,
      distribution: { type: Schema.Types.Mixed },
    },
    // Added in task 7.5 (not yet in DATABASE.md): text + voice emotion fused by confidence (FR-EMO-02)
    fusedEmotion: {
      label: String,
      confidence: Number,
      distribution: { type: Schema.Types.Mixed },
    },
    // Task M.10 (FR-VOI-10): where the audio came from and how the two voices were separated.
    // Features above come from the caller's speech only; nothing identifying the voice is stored here.
    audioSource: { type: String, enum: ["CALLER_ONLY", "MIXED"], default: "MIXED" },
    speakers: {
      separated: Boolean,
      confident: Boolean,
      callerMs: Number,
      operatorMs: Number,
    },
    modelVersion: { type: String, required: true },
    purgeAt: Date,
  },
  appendOnly,
);
VoiceWindowSchema.index({ interactionId: 1, windowIndex: 1 }, { unique: true });
VoiceWindowSchema.index({ purgeAt: 1 }, { expireAfterSeconds: 0 });

export const VoiceWindow = getModel("VoiceWindow", VoiceWindowSchema, "voice_windows");
