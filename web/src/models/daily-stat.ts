/** `daily_stats` collection (split from docs/models.ts, task 1.2). */
import { Schema } from "mongoose";
import { getModel, ObjectId } from "./_shared";
import { CHANNELS, RISK_BANDS } from "./enums";

const DailyStatSchema = new Schema(
  {
    day: { type: Date, required: true },
    stateId: { type: ObjectId, ref: "State" },
    districtId: { type: ObjectId, ref: "District" },
    channel: { type: String, enum: CHANNELS },
    language: String,
    band: { type: String, enum: RISK_BANDS },
    interactions: { type: Number, default: 0 },
    criticalAlerts: { type: Number, default: 0 },
    medianAckSec: Number,
    medianFirstResponseSec: Number,
    referralsCreated: { type: Map, of: Number }, // by support type
    referralsDone: { type: Map, of: Number },
  },
  { versionKey: false },
);
DailyStatSchema.index({ day: 1, stateId: 1, districtId: 1, channel: 1, language: 1, band: 1 }, { unique: true });

export const DailyStat = getModel("DailyStat", DailyStatSchema, "daily_stats");
