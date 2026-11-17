/**
 * GET /api/v1/integration/interactions/{id}/next-question (Phase P, task P.3, FR-API-07,
 * API_CONTRACTS §6.7). The next scripted, pre-translated question for the calling system's chatbot,
 * chosen by the same rules as the operator console. The module suggests; the calling system asks and
 * sends it back as an OPERATOR turn. Only for interactions this client created; scope `questions:read`.
 * Never the staff-facing reason, dimensions, overrides, score or band.
 */
import { nextQuestionView } from "@/core/integration/next-question";
import { loadOwned } from "@/core/integration/owned";
import { loadQuestionInput } from "@/core/operator/load";
import { nextChatbotQuestion } from "@/core/operator/suggest";
import { route } from "@/lib/route";

export const GET = route({ auth: "api", scope: "questions:read" }, async ({ client, params }) => {
  const own = await loadOwned(String(params.id), client.id);
  return nextQuestionView(own.lang, nextChatbotQuestion(await loadQuestionInput(own.id, own.lang)));
});
