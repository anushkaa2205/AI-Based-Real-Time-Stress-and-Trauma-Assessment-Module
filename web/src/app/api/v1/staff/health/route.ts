/** GET /api/v1/staff/health (API_CONTRACTS §5.9, task 1.11). */
import mongoose from "mongoose";
import type { z } from "zod";
import type { Health } from "@/contracts/staff";
import { env } from "@/lib/env";
import { route } from "@/lib/route";

const ANALYSIS_TIMEOUT_MS = 2_000;

async function analysisStatus(): Promise<"ok" | "degraded"> {
  try {
    const res = await fetch(new URL("/v1/health", env().ANALYSIS_URL), {
      signal: AbortSignal.timeout(ANALYSIS_TIMEOUT_MS),
      cache: "no-store",
    });
    return res.ok ? "ok" : "degraded";
  } catch {
    return "degraded";
  }
}

export const GET = route({ auth: "staff", action: "staff.self" }, async (): Promise<z.infer<typeof Health>> => {
  const dbOk = mongoose.connection.readyState === 1 && (await mongoose.connection.db?.admin().ping())?.ok === 1;
  const e = env();
  // Real-time is wired in task 5.1; until then report whether it is configured.
  const realtime = e.REALTIME_DRIVER === "sse" || (e.PUSHER_KEY && e.PUSHER_SECRET) ? "ok" : "degraded";
  return { db: dbOk ? "ok" : "down", analysis: await analysisStatus(), realtime };
});
