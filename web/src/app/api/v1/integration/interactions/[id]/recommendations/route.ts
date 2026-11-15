/** GET /api/v1/integration/interactions/{id}/recommendations (task 8.4, §6, FR-API-01). */
import { recommendationDto, userNames } from "@/core/cases/dto";
import { loadOwned } from "@/core/integration/owned";
import { route } from "@/lib/route";
import { Recommendation } from "@/models";

export const GET = route({ auth: "api", scope: "assessments:read" }, async ({ client, params }) => {
  const own = await loadOwned(String(params.id), client.id);
  const recs = await Recommendation.find({ interactionId: own.id, status: { $ne: "SUPERSEDED" } })
    .sort({ createdAt: 1 })
    .lean();
  const names = await userNames(recs.map((r) => r.decision?.byUserId));
  return { items: recs.map((r) => recommendationDto(r, names)) };
});
