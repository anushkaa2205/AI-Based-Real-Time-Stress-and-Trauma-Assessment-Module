/** GET /api/v1/staff/health (API_CONTRACTS §5.9, task 1.11). */
import mongoose from "mongoose";
import type { z } from "zod";
import type { Health } from "@/contracts/staff";
import { analysisStatus } from "@/lib/analysis-health";
import { env } from "@/lib/env";
import { route } from "@/lib/route";

export const GET = route({ auth: "staff", action: "staff.self" }, async (): Promise<z.infer<typeof Health>> => {
  const dbOk = mongoose.connection.readyState === 1 && (await mongoose.connection.db?.admin().ping())?.ok === 1;
  const e = env();
  // Real-time is wired in task 5.1; until then report whether it is configured.
  const realtime = e.REALTIME_DRIVER === "sse" || (e.PUSHER_KEY && e.PUSHER_SECRET) ? "ok" : "degraded";
  return { db: dbOk ? "ok" : "down", analysis: await analysisStatus(), realtime };
});
