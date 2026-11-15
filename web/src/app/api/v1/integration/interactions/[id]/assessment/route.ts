/** GET /api/v1/integration/interactions/{id}/assessment (task 8.4, §6, FR-API-01). */
import { latestAssessment } from "@/core/integration/assessment";
import { loadOwned } from "@/core/integration/owned";
import { ApiError } from "@/lib/problem";
import { route } from "@/lib/route";

export const GET = route({ auth: "api", scope: "assessments:read" }, async ({ client, params }) => {
  const own = await loadOwned(String(params.id), client.id);
  const a = await latestAssessment(own.id);
  if (!a) throw new ApiError("NOT_FOUND", "No assessment yet");
  const { assessmentId: _id, seq: _seq, ...rest } = a; // §6 shape
  void _id;
  void _seq;
  return rest;
});
