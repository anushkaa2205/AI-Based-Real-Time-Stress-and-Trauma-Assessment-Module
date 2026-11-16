/**
 * POST /api/v1/integration/interactions/{id}/end (task 8.4, §6): `{ reason }` → 200.
 * Starts retention (task 8.7) and, after the response, writes the neutral case summary for
 * responders (FR-NLP-09, FR-CH-10; only with text-analysis consent).
 */
import { after } from "next/server";
import { IntegrationEnd } from "@/contracts/integration";
import { loadOwned } from "@/core/integration/owned";
import { endInteraction } from "@/core/interactions/service";
import { summarizeInteraction } from "@/core/interactions/summary";
import { route } from "@/lib/route";

export const POST = route({ auth: "api", scope: "interactions:write", body: IntegrationEnd }, async ({ client, params, body }) => {
  const own = await loadOwned(String(params.id), client.id);
  const wasActive = own.status === "ACTIVE";
  const r = await endInteraction(own.id, body.reason, { type: "API_CLIENT", id: client.id });
  if (wasActive && body.reason === "COMPLETED") after(() => summarizeInteraction(own.id));
  return { docketNumber: r.docketNumber, status: "ENDED" };
});
