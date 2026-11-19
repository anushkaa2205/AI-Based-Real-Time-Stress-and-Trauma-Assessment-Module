/**
 * Shapes the conversation-language answer (task P.11, API_CONTRACTS §6.8). Pure, so the exact key
 * set is testable without a database: the new language and the scripted questions already sent as
 * OPERATOR turns, in the order sent, re-worded in it. An operator's own words are left out, and
 * stored turns are never rewritten (FR-NLP-11 reads the answer with the question as it was asked).
 */
import type { LanguageResponse } from "@/contracts/integration";
import type { VictimLang } from "@/contracts/interaction";
import { t } from "@/core/i18n/messages";
import { questionKeyOf } from "@/core/operator/asked";

export function languageView(lang: VictimLang, operatorTurns: readonly string[]): LanguageResponse {
  const asked: LanguageResponse["asked"] = [];
  for (const turn of operatorTurns) {
    const key = questionKeyOf(turn);
    if (key) asked.push({ key, text: t(lang, key) });
  }
  return { language: lang, asked };
}
