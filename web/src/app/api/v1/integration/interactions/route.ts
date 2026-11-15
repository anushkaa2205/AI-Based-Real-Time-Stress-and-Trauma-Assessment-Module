/**
 * POST /api/v1/integration/interactions (task 8.4, API_CONTRACTS §6, FR-API-01/04).
 * Starts an interaction for an integrating system (portal, IVRS platform, call-centre software),
 * linked to an NHAA docket. The system must have collected consent and passes the notice version
 * it showed; the safety check runs whatever the consent says (rule 6).
 */
import { IntegrationStart } from "@/contracts/integration";
import { giveConsent, startInteraction } from "@/core/victim/service";
import { route } from "@/lib/route";

export const POST = route({ auth: "api", scope: "interactions:write", body: IntegrationStart }, async ({ client, body }) => {
  const started = await startInteraction({
    channel: body.channel,
    language: body.language,
    docketNumber: body.docketNumber ?? null,
    districtCode: body.districtCode ?? null,
    apiClientId: client.id,
    externalRef: body.externalRef,
  });
  // The victim session token is not used by integrations; it simply expires.
  const mode = await giveConsent(started.interactionId, body.consent, { type: "API_CLIENT", id: client.id });
  return Response.json({ interactionId: started.interactionId, docketNumber: started.docketNumber, mode }, { status: 201 });
});
