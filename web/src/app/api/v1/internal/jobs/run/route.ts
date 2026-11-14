/** POST /api/v1/internal/jobs/run (task 5.7): runs due jobs. Needs the X-Jobs-Secret header. */
import { timingSafeEqual } from "node:crypto";
import { runDue } from "@/core/jobs/runDue";
import { env } from "@/lib/env";
import { ApiError } from "@/lib/problem";
import { route } from "@/lib/route";

function secretMatches(given: string | null): boolean {
  const expected = Buffer.from(env().JOBS_SECRET);
  const actual = Buffer.from(given ?? "");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export const POST = route({ auth: "public", rateLimit: false }, async ({ req }) => {
  if (!secretMatches(req.headers.get("x-jobs-secret"))) throw new ApiError("UNAUTHENTICATED");
  return runDue();
});
