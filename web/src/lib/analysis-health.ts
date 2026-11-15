/** Is the AI analysis service reachable? Used by the staff health endpoint (task 1.11). */
import { env } from "@/lib/env";

const ANALYSIS_TIMEOUT_MS = 2_000;

export async function analysisStatus(): Promise<"ok" | "degraded"> {
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
