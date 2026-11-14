/** GET /api/v1/staff/interactions/{id}/assessments: SVI timeline (task 5.3, FR-SVI-05). District roles get band + SVI only. */
import { z } from "zod";
import { assessmentDto } from "@/core/cases/dto";
import { loadInteractionResource } from "@/core/cases/resource";
import { serializeAssessment } from "@/core/policies/serializers";
import { route } from "@/lib/route";
import { Assessment } from "@/models";

export const GET = route(
  { auth: "staff", action: "case.assessment.read", query: z.object({ from: z.iso.datetime().optional(), to: z.iso.datetime().optional() }) },
  async ({ user, params, query, authorize }) => {
    const id = String(params.id);
    const { resource } = await loadInteractionResource(id);
    authorize("case.assessment.read", resource);
    const filter: Record<string, unknown> = { interactionId: id };
    if (query.from || query.to) filter.createdAt = { ...(query.from ? { $gte: new Date(query.from) } : {}), ...(query.to ? { $lte: new Date(query.to) } : {}) };
    const rows = await Assessment.find(filter).sort({ seq: 1 }).limit(500).lean();
    return { items: rows.map((a) => serializeAssessment(user, assessmentDto(a), resource)) };
  },
);
