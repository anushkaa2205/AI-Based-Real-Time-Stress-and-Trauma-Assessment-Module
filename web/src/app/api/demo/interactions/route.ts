/**
 * POST /api/demo/interactions (API_CONTRACTS §6.5, tasks M.11, M.14). Starts a demo interaction by
 * calling `POST /api/v1/integration/interactions` with the demo key, as an NHAA system would. The
 * module tags it demo from the key (M.7). The case id is looked up only so the presenter's results
 * view can read the case through the staff API.
 */
import { DEMO_CHANNEL, DemoStart } from "@/contracts/demo";
import { callModule } from "@/core/demo/client";
import { demoRoute, originOf } from "@/core/demo/route";
import { Interaction } from "@/models";

/** Free-tier limit (PRODUCT_VISION.md §6): one live microphone call at a time. A new one ends older ones. */
const LIVE_REF = "demo:live_audio:live";

export const POST = demoRoute({ body: DemoStart }, async ({ req, body }) => {
  if (body.mode === "LIVE_AUDIO") {
    const older = await Interaction.find({ externalRef: LIVE_REF, status: "ACTIVE", isDemo: true }).select("_id").limit(10).lean();
    for (const o of older) await callModule(originOf(req), `/interactions/${String(o._id)}/end`, { json: { reason: "COMPLETED" } });
  }
  const started = await callModule<{ interactionId?: string; docketNumber?: string; mode?: string }>(originOf(req), "/interactions", {
    json: {
      channel: DEMO_CHANNEL[body.mode],
      language: body.language,
      districtCode: null,
      externalRef: `demo:${body.mode.toLowerCase()}:${body.scenarioId ?? "live"}`,
      consent: body.consent,
    },
  });
  if (started.status !== 201 || !started.body?.interactionId) return Response.json({ status: started.status, body: started.body, call: started.call }, { status: 502 });
  const i = await Interaction.findById(started.body.interactionId).select("caseId").lean();
  return Response.json(
    {
      interactionId: started.body.interactionId,
      docketNumber: started.body.docketNumber,
      caseId: i ? String(i.caseId) : null,
      mode: started.body.mode,
      channel: DEMO_CHANNEL[body.mode],
      call: started.call,
    },
    { status: 201 },
  );
});
