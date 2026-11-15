/** POST /api/v1/integration/interactions/{id}/audio (task 8.4, §6): same as §3.7 → 202. */
import { loadOwned } from "@/core/integration/owned";
import { handleAudioChunk } from "@/core/voice/chunk";
import { route } from "@/lib/route";

export const POST = route({ auth: "api", scope: "interactions:write" }, async ({ req, client, params }) => {
  const own = await loadOwned(String(params.id), client.id);
  return handleAudioChunk(req, own.id, own.lang);
});
