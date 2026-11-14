/** POST /api/v1/victim/interactions/{id}/consent (API_CONTRACTS §3.3, FR-CON-01…06). */
import { ConsentRequest, ConsentResponse } from "@/contracts/victim";
import { giveConsent } from "@/core/victim/service";
import { currentTurn } from "@/core/victim/service";
import { route } from "@/lib/route";

export const POST = route({ auth: "victim", body: ConsentRequest }, async ({ victim, body }) => {
  const mode = await giveConsent(victim.interactionId, body);
  const turn = await currentTurn(victim.interactionId);
  return ConsentResponse.parse({ mode, next: turn.prompt });
});
