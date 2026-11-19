/**
 * POST /api/demo/interactions/{id}/language (task P.11, API_CONTRACTS §6.5, plan §6.7). The visitor
 * switched the site language during the conversation: relayed to `PUT /api/v1/integration/…/language`
 * with the demo key, and only the **text** of the assistant's questions asked so far comes back, in
 * the order asked and re-worded in the new language, so the page can replace the lines it shows.
 * Shares the per-visitor message limit. Public: only this browser's own cases.
 */
import { DemoLanguage, type DemoLanguageResult } from "@/contracts/demo";
import { openCase, passThrough } from "@/core/demo/assistant";
import { callModule } from "@/core/demo/client";
import { publicDemoRoute } from "@/core/demo/public";
import { originOf } from "@/core/demo/route";

export const POST = publicDemoRoute({ body: DemoLanguage, limit: "message", owned: true }, async ({ req, params, body }) => {
  const id = String(params.id);
  await openCase(id, Date.now());
  const r = await callModule<{ asked?: { text?: unknown }[]; code?: string }>(originOf(req), `/interactions/${id}/language`, { method: "PUT", json: { language: body.language } });
  if (r.status !== 200) passThrough(r.status, r.body?.code);
  const out: DemoLanguageResult = { questions: (r.body?.asked ?? []).map((a) => (typeof a.text === "string" ? a.text : "")) };
  return out;
});
