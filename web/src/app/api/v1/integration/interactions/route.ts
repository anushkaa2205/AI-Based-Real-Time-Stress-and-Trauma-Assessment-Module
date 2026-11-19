/**
 * POST /api/v1/integration/interactions (task 8.4, API_CONTRACTS §6, FR-API-01/04).
 * Starts an interaction for a calling NHAA system (chatbot, call-centre software, IVRS platform, app),
 * linked to an NHAA docket. The system must have collected consent and passes the notice version
 * it showed; the safety lexicon runs whatever the consent says (rule 6).
 */
import { IntegrationStart } from "@/contracts/integration";
import { giveConsent, startInteraction } from "@/core/interactions/service";
import { route } from "@/lib/route";

export const POST = route({ auth: "api", scope: "interactions:write", body: IntegrationStart }, async ({ client, body }) => {
  const started = await startInteraction({
    channel: body.channel,
    language: body.language,
    docketNumber: body.docketNumber ?? null,
    districtCode: body.districtCode ?? null,
    apiClientId: client.id,
    externalRef: body.externalRef,
    isPortal: client.isPortal, // M.7: tagged on the server from the key
  });
  const mode = await giveConsent(started.interactionId, body.consent, { type: "API_CLIENT", id: client.id });
  return Response.json({ interactionId: started.interactionId, docketNumber: started.docketNumber, mode }, { status: 201 });
});
