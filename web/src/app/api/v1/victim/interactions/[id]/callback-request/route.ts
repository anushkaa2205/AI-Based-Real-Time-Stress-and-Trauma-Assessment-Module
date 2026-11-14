/**
 * POST /api/v1/victim/interactions/{id}/callback-request (§3.11, FR-REC-06).
 * The phone number goes only to the PII vault; a Critical alert asks staff to call back.
 */
import { CallbackRequest, CallbackResponse } from "@/contracts/victim";
import { t } from "@/core/i18n/messages";
import { requestCallback } from "@/core/victim/service";
import { route } from "@/lib/route";

export const POST = route({ auth: "victim", body: CallbackRequest }, async ({ victim, body }) => {
  await requestCallback(victim.interactionId, body.phone);
  const res = CallbackResponse.parse({ requested: true, message: t(body.preferredLanguage ?? victim.lang, "emergency.callbackSent") });
  return Response.json(res, { status: 201 });
});
