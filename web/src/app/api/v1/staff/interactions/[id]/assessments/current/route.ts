/** GET /api/v1/staff/interactions/{id}/assessments/current (task 5.3). */
import { assessmentDto } from "@/core/cases/dto";
import { loadInteractionResource } from "@/core/cases/resource";
import { serializeAssessment } from "@/core/policies/serializers";
import { ApiError } from "@/lib/problem";
import { route } from "@/lib/route";
import { Assessment } from "@/models";

export const GET = route({ auth: "staff", action: "case.assessment.read" }, async ({ user, params, authorize }) => {
  const id = String(params.id);
  const { resource } = await loadInteractionResource(id);
  authorize("case.assessment.read", resource);
  const a = await Assessment.findOne({ interactionId: id }).sort({ seq: -1 }).lean();
  if (!a) throw new ApiError("NOT_FOUND");
  return serializeAssessment(user, assessmentDto(a), resource);
});
