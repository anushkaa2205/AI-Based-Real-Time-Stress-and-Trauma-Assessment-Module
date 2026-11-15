/**
 * POST /api/v1/victim/interactions/{id}/audio: one voice chunk (API_CONTRACTS §3.7, task 7.5).
 * The work is in core/voice/chunk.ts (shared with the integration API).
 */
import { handleAudioChunk } from "@/core/voice/chunk";
import { route } from "@/lib/route";

export const POST = route({ auth: "victim" }, async ({ req, victim }) => handleAudioChunk(req, victim.interactionId, victim.lang));
