/** POST /api/v1/integration/interactions/{id}/end (task 8.4, §6): `{ reason }` → 200. Starts retention (task 8.7). */
import { IntegrationEnd } from "@/contracts/integration";
import { loadOwned } from "@/core/integration/owned";
import { endInteraction } from "@/core/victim/service";
import { route } from "@/lib/route";

export const POST = route({ auth: "api", scope: "interactions:write", body: IntegrationEnd }, async ({ client, params, body }) => {
  const own = await loadOwned(String(params.id), client.id);
  const r = await endInteraction(own.id, body.reason);
  return { docketNumber: r.docketNumber, status: "ENDED" };
});
