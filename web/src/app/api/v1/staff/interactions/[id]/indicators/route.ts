/**
 * GET /api/v1/staff/interactions/{id}/indicators (task 5.3, FR-IND-04).
 * Evidence quotes are decrypted for roles allowed to read transcripts only.
 */
import { z } from "zod";
import { Dimension, IndicatorStatus } from "@/contracts/common";
import { indicatorDto, userNames } from "@/core/cases/dto";
import { loadInteractionResource } from "@/core/cases/resource";
import { route } from "@/lib/route";
import { Indicator } from "@/models";

export const GET = route(
  { auth: "staff", action: "case.transcript.read", query: z.object({ dimension: Dimension.optional(), status: IndicatorStatus.optional() }) },
  async ({ params, query, authorize }) => {
    const id = String(params.id);
    const { resource } = await loadInteractionResource(id);
    authorize("case.transcript.read", resource);
    const filter: Record<string, unknown> = { interactionId: id };
    if (query.dimension) filter.dimension = query.dimension;
    if (query.status) filter.status = query.status;
    const rows = await Indicator.find(filter).sort({ createdAt: 1 }).limit(1000).lean();
    const names = await userNames(rows.map((r) => r.review?.byUserId));
    return { items: rows.map((r) => indicatorDto(r, names)) };
  },
);
