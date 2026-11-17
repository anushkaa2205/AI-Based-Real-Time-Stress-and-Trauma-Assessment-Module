/**
 * Shapes the next-question answer (task P.3, API_CONTRACTS §6.7). Pure, so the exact key set is
 * testable without a database: `{ question: { key, text } | null }` and nothing else.
 */
import type { NextQuestionResponse } from "@/contracts/integration";
import type { VictimLang } from "@/contracts/interaction";
import { t } from "@/core/i18n/messages";

export function nextQuestionView(lang: VictimLang, key: string | null): NextQuestionResponse {
  return { question: key ? { key, text: t(lang, key) } : null };
}
