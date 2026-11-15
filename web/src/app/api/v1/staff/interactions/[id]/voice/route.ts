/** GET /api/v1/staff/interactions/{id}/voice?fromWindow= (API_CONTRACTS §5.3, task 7.5): features only, never audio. */
import { z } from "zod";
import { loadInteractionResource } from "@/core/cases/resource";
import { route } from "@/lib/route";
import { VoiceWindow } from "@/models";

export const GET = route(
  { auth: "staff", action: "case.transcript.read", query: z.object({ fromWindow: z.coerce.number().int().min(0).default(0) }) },
  async ({ params, query, authorize }) => {
    const id = String(params.id);
    const { resource } = await loadInteractionResource(id);
    authorize("case.transcript.read", resource);
    const rows = await VoiceWindow.find({ interactionId: id, windowIndex: { $gte: query.fromWindow } })
      .sort({ windowIndex: 1 })
      .limit(500)
      .select("windowIndex startMs endMs pauses pitch speechRateWpm energy events emotion fusedEmotion baselineDeviation")
      .lean();
    return {
      items: rows.map((w) => ({
        windowIndex: w.windowIndex,
        startMs: w.startMs,
        endMs: w.endMs,
        pauses: w.pauses,
        pitch: w.pitch ?? null,
        speechRateWpm: w.speechRateWpm ?? null,
        energy: w.energy ?? null,
        events: w.events ?? [],
        emotion: w.emotion ?? null,
        fusedEmotion: w.fusedEmotion ?? null,
        baselineDeviation: w.baselineDeviation ?? null,
      })),
    };
  },
);
