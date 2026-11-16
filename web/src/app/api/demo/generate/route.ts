/**
 * POST /api/demo/generate (API_CONTRACTS §6.5, task M.13). Asks the analysis service to write a
 * SYNTHETIC chatbot conversation from the presenter's options, on the free Groq quota. The synthetic
 * chatbot may only use NHAA's scripted questions (messages/*.json), so its answers are read exactly
 * as in a real chat. The result is labelled synthetic; the page then plays it through /messages.
 * Nothing here talks to a real person or scores anything (CLAUDE.md rules 2 and 3).
 */
import { randomUUID } from "node:crypto";
import { DemoGenerate } from "@/contracts/demo";
import { generateConversation } from "@/core/analysis-client/client";
import { demoRoute } from "@/core/demo/route";
import { MESSAGES } from "@/core/i18n/messages";
import { ApiError } from "@/lib/problem";

export const maxDuration = 60;

export const POST = demoRoute({ body: DemoGenerate }, async ({ body }) => {
  const questions = Object.values(MESSAGES[body.language].operatorQuestions as Record<string, string>);
  const r = await generateConversation({ requestId: randomUUID(), ...body, questions });
  if (r.degraded) throw new ApiError("ANALYSIS_DEGRADED", `The text generator is unavailable (${r.reason}). Try again, or type the conversation in Live text.`);
  return { turns: r.result.turns, synthetic: true, modelVersion: r.result.modelVersion };
});
