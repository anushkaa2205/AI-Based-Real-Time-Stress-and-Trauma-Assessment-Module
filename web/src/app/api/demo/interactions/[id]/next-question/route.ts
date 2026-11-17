/**
 * POST /api/demo/interactions/{id}/next-question (Phase P, task P.4; API_CONTRACTS §6.5). Used after
 * **Done** on Speak and for **Skip this question**: reads the next scripted question from the module,
 * records it as an OPERATOR turn (a skipped question stays recorded as asked) and returns its text.
 * Shares the per-visitor message limit. Public: only this browser's own cases.
 */
import type { DemoNextQuestion } from "@/contracts/demo";
import { askNext, openCase } from "@/core/demo/assistant";
import { publicDemoRoute } from "@/core/demo/public";
import { originOf } from "@/core/demo/route";

export const POST = publicDemoRoute({ limit: "message", owned: true }, async ({ req, params }) => {
  const id = String(params.id);
  await openCase(id, Date.now());
  const out: DemoNextQuestion = { question: await askNext(originOf(req), id) };
  return out;
});
