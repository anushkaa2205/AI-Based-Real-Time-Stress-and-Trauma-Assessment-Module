/** POST /api/v1/victim/interactions/{id}/language: switch language, re-send the prompt (§3.10, FR-LANG-03). */
import { LanguageRequest, LanguageResponse } from "@/contracts/victim";
import { currentTurn, setLanguage } from "@/core/victim/service";
import { route } from "@/lib/route";

export const POST = route({ auth: "victim", body: LanguageRequest }, async ({ victim, body }) => {
  await setLanguage(victim.interactionId, body.language);
  const turn = await currentTurn(victim.interactionId);
  return LanguageResponse.parse({ next: turn.prompt });
});
