/**
 * GET /api/v1/integration/interactions/{id}/indicators (task M.5, gap V1, API_CONTRACTS §6.4a,
 * FR-API-01, FR-IND-04). Indicators with their evidence, for systems holding the `indicators:read`
 * scope. Only for interactions this client created. Never to be shown to the person (rule 1).
 */
import { listIntegrationIndicators } from "@/core/integration/indicators";
import { loadOwned } from "@/core/integration/owned";
import { route } from "@/lib/route";

export const GET = route({ auth: "api", scope: "indicators:read" }, async ({ client, params }) => {
  const own = await loadOwned(String(params.id), client.id);
  return { items: await listIntegrationIndicators(own.id) };
});
