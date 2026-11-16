/**
 * POST /api/v1/integration/interactions/{id}/consent/withdraw (task M.2, API_CONTRACTS §6.1,
 * FR-CON-04, AC-CON-04). The calling system withdraws consent for the person: analysis stops at
 * once (mode SAFETY_ONLY; the safety lexicon keeps running, rule 6) and stored audio is deleted.
 */
import { WithdrawRequest, WithdrawResponse } from "@/contracts/interaction";
import { loadOwned } from "@/core/integration/owned";
import { withdrawConsent } from "@/core/interactions/service";
import { route } from "@/lib/route";

export const POST = route({ auth: "api", scope: "interactions:write", body: WithdrawRequest }, async ({ client, params }) => {
  const own = await loadOwned(String(params.id), client.id);
  return WithdrawResponse.parse(await withdrawConsent(own.id, { type: "API_CLIENT", id: client.id }));
});
