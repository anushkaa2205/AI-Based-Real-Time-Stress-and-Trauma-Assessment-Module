/**
 * POST /api/portal/interactions (API_CONTRACTS §6.5, tasks N.4, P.4). Starts a portal case by calling
 * `POST /api/v1/integration/interactions` with the portal key, as an NHAA system would. The module
 * tags it as a portal case from the key (M.7). Phase P: the relay then reads the opening question from the
 * module, records it as an OPERATOR turn and returns its text. Public: the browser is given a
 * signed cookie naming its own cases, and only `{ interactionId, question }` comes back (plan §7).
 */
import { PORTAL_CHANNEL, PortalStart, type PortalStarted } from "@/contracts/portal";
import { askNext } from "@/core/portal/assistant";
import { callModule } from "@/core/portal/client";
import { checkDailyCap, lineIsBusy, publicPortalRoute, rememberOwned } from "@/core/portal/public";
import { originOf } from "@/core/portal/route";
import { access } from "@/core/policies/rbac";
import { ApiError } from "@/lib/problem";
import { currentStaff } from "@/lib/staff-session";
import { Interaction } from "@/models";

/** Free-tier limit (PRODUCT_VISION.md §6): one live microphone call at a time. */
export const LIVE_REF = "portal:live_audio:live";

export const POST = publicPortalRoute({ body: PortalStart, limit: "start" }, async ({ req, body }) => {
  const now = Date.now();
  if (!(await checkDailyCap(now))) throw new ApiError("RATE_LIMITED", "The portal is resting for today; please try again tomorrow");

  if (body.mode === "LIVE_AUDIO") {
    const active = await Interaction.find({ externalRef: LIVE_REF, status: "ACTIVE", isPortal: true }).select("_id updatedAt").limit(10).lean();
    const busy = active.some((a) => lineIsBusy({ updatedAt: a.updatedAt as Date }, now));
    if (busy) {
      // Plan §7: a newcomer never cuts a call off; a signed-in supervisor may take the line over.
      const staff = body.takeover ? await currentStaff() : null;
      if (!staff || !access(staff, "portal.takeover")) throw new ApiError("LINE_BUSY");
    }
    // Idle or taken-over calls are ended so the line is free.
    for (const a of active) await callModule(originOf(req), `/interactions/${String(a._id)}/end`, { json: { reason: "TIMEOUT" } });
  }

  const started = await callModule<{ interactionId?: string }>(originOf(req), "/interactions", {
    json: {
      channel: PORTAL_CHANNEL[body.mode],
      language: body.language,
      districtCode: body.districtCode,
      externalRef: body.mode === "LIVE_AUDIO" ? LIVE_REF : `portal:${body.mode.toLowerCase()}:live`,
      consent: body.consent,
    },
  });
  if (started.status !== 201 || !started.body?.interactionId) throw new ApiError("ANALYSIS_DEGRADED", "The module could not start a case");
  const id = started.body.interactionId;
  // The case exists now; if the opening question cannot be read, the person can still write or speak.
  const question = await askNext(originOf(req), id).catch(() => null);
  const out: PortalStarted = { interactionId: id, question };
  return rememberOwned(req, Response.json(out, { status: 201 }), id);
});
