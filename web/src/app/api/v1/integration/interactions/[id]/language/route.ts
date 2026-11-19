/**
 * PUT /api/v1/integration/interactions/{id}/language (task P.11, FR-LANG-07, API_CONTRACTS §6.8).
 * The person changed language mid-conversation: store the interaction's new language, so the next
 * scripted questions, the emergency options and the speech-to-text hint follow it, and return the
 * questions asked so far re-worded in it. Only for interactions this client created, while active.
 */
import { LanguageRequest } from "@/contracts/integration";
import { languageView } from "@/core/integration/language";
import { loadOwned } from "@/core/integration/owned";
import { loadOperatorTurns } from "@/core/operator/load";
import { route } from "@/lib/route";
import { ApiError } from "@/lib/problem";
import { Interaction } from "@/models";

export const PUT = route({ auth: "api", scope: "interactions:write", body: LanguageRequest }, async ({ client, params, body }) => {
  const own = await loadOwned(String(params.id), client.id);
  if (own.status !== "ACTIVE") throw new ApiError("INTERACTION_ENDED");
  if (own.lang !== body.language) await Interaction.updateOne({ _id: own.id }, { $set: { uiLanguage: body.language } });
  return languageView(body.language, await loadOperatorTurns(own.id));
});
