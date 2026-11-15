/**
 * Victim session check for /api/v1/victim/interactions/{id}/… (task 3.2).
 * The token (cookie `nhaa_vs`, or `X-Victim-Session` for IVRS/API channels)
 * must match the interaction in the URL: one token, one interaction.
 */
import { toVictimLang } from "@/contracts/victim";
import type { NextRequest } from "next/server";
import type { VictimLang } from "@/contracts/victim";
import { SESSION_TTL_MS, VICTIM_COOKIE, VICTIM_HEADER, hashSessionToken } from "@/core/victim/session";
import { db } from "@/lib/db";
import { ApiError } from "@/lib/problem";
import { Interaction } from "@/models/interaction";

export interface VictimSession {
  interactionId: string;
  caseId: string;
  lang: VictimLang;
}

export async function loadVictimSession(req: NextRequest, interactionId: unknown): Promise<VictimSession> {
  const token = req.cookies.get(VICTIM_COOKIE)?.value ?? req.headers.get(VICTIM_HEADER) ?? "";
  if (!token || typeof interactionId !== "string" || !/^[a-f0-9]{24}$/.test(interactionId)) {
    throw new ApiError("SESSION_EXPIRED");
  }
  await db();
  const now = Date.now();
  // Match on id AND token hash; slide the expiry in the same atomic update.
  const doc = await Interaction.findOneAndUpdate(
    { _id: interactionId, sessionTokenHash: hashSessionToken(token), sessionExpiresAt: { $gt: new Date(now) } },
    { $set: { sessionExpiresAt: new Date(now + SESSION_TTL_MS) } },
    { returnDocument: "after", projection: { caseId: 1, uiLanguage: 1 } },
  ).lean();
  if (!doc) throw new ApiError("SESSION_EXPIRED");
  return {
    interactionId,
    caseId: String(doc.caseId),
    lang: toVictimLang(doc.uiLanguage),
  };
}
