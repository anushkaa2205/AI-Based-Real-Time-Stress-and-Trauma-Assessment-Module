/**
 * The portal assistant on the server side (Phase P, task P.4; NIVARA_FLOW_AND_UI_PLAN.md §7, §8.3).
 * Demo layer only; the module never imports this.
 *
 * - `askNext` reads the next scripted question from the module (`GET …/next-question`, scope
 *   questions:read) and records it as an OPERATOR turn **before** the page shows it, so the person's
 *   answer is read with its question (FR-NLP-11). Only the server records OPERATOR turns; a visitor
 *   can never write the assistant's lines. The page learns the question's text only, never its key.
 * - `openCase` checks a case is still open for input (15-minute cap) and marks activity, which keeps
 *   a live microphone call alive (busy line, 60 s).
 */
import { ApiError, type ErrorCode } from "@/lib/problem";
import { Interaction } from "@/models";
import { callModule } from "./client";
import { caseExpired } from "./guard";

/** The module's refusals that a page can act on; anything else is reported as degraded. */
export function passThrough(status: number, code: string | undefined): never {
  if (status === 409 && (code === "CONSENT_REQUIRED" || code === "INTERACTION_ENDED")) throw new ApiError(code as ErrorCode);
  if (status === 404) throw new ApiError("NOT_FOUND");
  if (status === 403 && code === "SCOPE_MISSING") throw new ApiError("ANALYSIS_DEGRADED", "The demo key needs the questions:read scope (npm run api:client -- --update-demo-scopes)");
  throw new ApiError("ANALYSIS_DEGRADED", "The module could not take this input");
}

export interface AssistantQuestion {
  text: string;
}

export async function askNext(origin: string, interactionId: string): Promise<AssistantQuestion | null> {
  const r = await callModule<{ question?: { key: string; text: string } | null; code?: string }>(origin, `/interactions/${interactionId}/next-question`, { method: "GET" });
  if (r.status !== 200) passThrough(r.status, r.body?.code);
  const q = r.body?.question;
  if (!q?.text) return null;
  const rec = await callModule<{ code?: string }>(origin, `/interactions/${interactionId}/messages`, { json: { text: q.text, sender: "OPERATOR", inputMethod: "TEXT" } });
  if (rec.status !== 201 && rec.status !== 200) passThrough(rec.status, rec.body?.code);
  return { text: q.text };
}

/**
 * Throws INTERACTION_ENDED once the conversation is over its time cap; otherwise marks activity
 * (`updatedAt`), which is what the busy-line rule reads.
 */
export async function openCase(interactionId: string, nowMs: number): Promise<void> {
  const i = await Interaction.findById(interactionId).select("createdAt status").lean();
  if (!i) throw new ApiError("NOT_FOUND");
  if (i.status !== "ACTIVE") throw new ApiError("INTERACTION_ENDED");
  if (caseExpired(i.createdAt as Date, nowMs)) throw new ApiError("INTERACTION_ENDED", "A demo conversation lasts at most fifteen minutes; press Submit to register it");
  await Interaction.updateOne({ _id: interactionId }, { $set: { updatedAt: new Date(nowMs) } }, { timestamps: false });
}
