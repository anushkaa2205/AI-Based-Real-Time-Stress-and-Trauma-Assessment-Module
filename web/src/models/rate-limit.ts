/**
 * `rate_limits`: fixed-window request counters (task 1.9, NFR-SEC-04).
 * Not in DATABASE.md's collection list yet; the plan (1.9) asks for
 * MongoDB-backed, TTL-indexed counters. Keys are hashes, never raw IPs.
 */
import { Schema } from "mongoose";
import { getModel } from "./_shared";

const RateLimitSchema = new Schema(
  {
    key: { type: String, required: true }, // sha256 of scope + subject (IP, session, API key)
    windowStart: { type: Date, required: true },
    count: { type: Number, default: 0 },
    expiresAt: { type: Date, required: true },
  },
  { versionKey: false },
);
RateLimitSchema.index({ key: 1, windowStart: 1 }, { unique: true });
RateLimitSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const RateLimit = getModel("RateLimit", RateLimitSchema, "rate_limits");
