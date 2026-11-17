/**
 * POST /api/demo/interactions (API_CONTRACTS §6.5, task N.4). Starts a demo case by calling
 * `POST /api/v1/integration/interactions` with the demo key, as an NHAA system would. The module
 * tags it demo from the key (M.7). Public: the browser is given a signed cookie naming its own
 * cases, and only `{ interactionId }` comes back (plan §7: nothing leaks; §8.3).
 */
import { DEMO_CHANNEL, DemoStart } from "@/contracts/demo";
import { callModule } from "@/core/demo/client";
import { checkDailyCap, lineIsBusy, publicDemoRoute, rememberOwned } from "@/core/demo/public";
import { originOf } from "@/core/demo/route";
import { access } from "@/core/policies/rbac";
import { ApiError } from "@/lib/problem";
import { currentStaff } from "@/lib/staff-session";
import { Interaction } from "@/models";

/** Free-tier limit (PRODUCT_VISION.md §6): one live microphone call at a time. */
export const LIVE_REF = "demo:live_audio:live";

export const POST = publicDemoRoute({ body: DemoStart, limit: "start" }, async ({ req, body }) => {
  const now = Date.now();
  if (!(await checkDailyCap(now))) throw new ApiError("RATE_LIMITED", "The demo is resting for today; please try again tomorrow");

  if (body.mode === "LIVE_AUDIO") {
    const active = await Interaction.find({ externalRef: LIVE_REF, status: "ACTIVE", isDemo: true }).select("_id updatedAt").limit(10).lean();
    const busy = active.some((a) => lineIsBusy({ updatedAt: a.updatedAt as Date }, now));
    if (busy) {
      // Plan §7: a newcomer never cuts a call off; a signed-in supervisor may take the line over.
      const staff = body.takeover ? await currentStaff() : null;
      if (!staff || !access(staff, "demo.use")) throw new ApiError("LINE_BUSY");
    }
    // Idle or taken-over calls are ended so the line is free.
    for (const a of active) await callModule(originOf(req), `/interactions/${String(a._id)}/end`, { json: { reason: "TIMEOUT" } });
  }

  const started = await callModule<{ interactionId?: string }>(originOf(req), "/interactions", {
    json: {
      channel: DEMO_CHANNEL[body.mode],
      language: body.language,
      districtCode: body.districtCode,
      externalRef: body.mode === "LIVE_AUDIO" ? LIVE_REF : `demo:${body.mode.toLowerCase()}:live`,
      consent: body.consent,
    },
  });
  if (started.status !== 201 || !started.body?.interactionId) throw new ApiError("ANALYSIS_DEGRADED", "The module could not start a case");
  const id = started.body.interactionId;
  return rememberOwned(req, Response.json({ interactionId: id }, { status: 201 }), id);
});
