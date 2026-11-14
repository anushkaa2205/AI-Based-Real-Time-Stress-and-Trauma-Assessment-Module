/** POST /api/v1/victim/interactions/{id}/end (§3.12, FR-CH-09). Quick exit clears the session cookie. */
import { cookies } from "next/headers";
import { after } from "next/server";
import { EndRequest, EndResponse } from "@/contracts/victim";
import { t } from "@/core/i18n/messages";
import { VICTIM_COOKIE } from "@/core/victim/session";
import { endInteraction } from "@/core/victim/service";
import { summarizeInteraction } from "@/core/victim/summary";
import { route } from "@/lib/route";

export const POST = route({ auth: "victim", body: EndRequest }, async ({ victim, body }) => {
  const ended = await endInteraction(victim.interactionId, body.reason);
  (await cookies()).delete({ name: VICTIM_COOKIE, path: "/api/v1/victim" });
  // Task 4.9: the case summary is written after the reply, so the person is not kept waiting.
  if (body.reason === "COMPLETED") after(() => summarizeInteraction(victim.interactionId));
  return EndResponse.parse({
    docketNumber: ended.docketNumber,
    closingMessage: t(ended.lang, "done.closing"),
    trackUrl: "tel:14566",
  });
});
