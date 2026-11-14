/** `jobs` collection (split from docs/models.ts, task 1.2). */
import { Schema } from "mongoose";
import { getModel, base } from "./_shared";
import { JOB_TYPES } from "./enums";

const JobSchema = new Schema(
  {
    type: { type: String, enum: JOB_TYPES, required: true },
    payload: { type: Schema.Types.Mixed, required: true },
    runAt: { type: Date, required: true },
    attempts: { type: Number, default: 0 },
    lockedUntil: Date,
    doneAt: Date,
    lastError: String,
    cleanupAt: Date, // TTL for finished jobs
  },
  base,
);
JobSchema.index({ doneAt: 1, runAt: 1 });
JobSchema.index({ cleanupAt: 1 }, { expireAfterSeconds: 0 });

export const Job = getModel("Job", JobSchema, "jobs");
