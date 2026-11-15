/**
 * Integration API: a client may only touch interactions it created (API_CONTRACTS §6:
 * "404 for interactions created by another client"), so it cannot even learn they exist.
 */
import { toVictimLang } from "@/contracts/victim";
import type { VictimLang } from "@/contracts/victim";
import { db } from "@/lib/db";
import { ApiError } from "@/lib/problem";
import { Interaction } from "@/models";

export async function loadOwned(interactionId: string, clientId: string): Promise<{ id: string; caseId: string; lang: VictimLang; status: string }> {
  if (!/^[a-f0-9]{24}$/.test(interactionId)) throw new ApiError("NOT_FOUND");
  await db();
  const i = await Interaction.findOne({ _id: interactionId, apiClientId: clientId }).select("caseId uiLanguage status").lean();
  if (!i) throw new ApiError("NOT_FOUND");
  return { id: String(i._id), caseId: String(i.caseId), lang: toVictimLang(i.uiLanguage), status: i.status };
}
