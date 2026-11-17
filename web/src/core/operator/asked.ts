/**
 * Which scripted questions were already asked in an interaction (task P.3, plan §8.2). Pure: the
 * OPERATOR turns' text in, `operatorQuestions.*` keys out. A turn counts as a question when it equals
 * that question's scripted wording in the interaction's language (spacing and case ignored).
 */
import type { VictimLang } from "@/contracts/interaction";
import { MESSAGES } from "@/core/i18n/messages";

const norm = (s: string) => s.normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase();

export function askedKeys(lang: VictimLang, operatorTurns: readonly string[]): string[] {
  const said = new Set(operatorTurns.map(norm));
  const questions = MESSAGES[lang].operatorQuestions as Record<string, string>;
  return Object.entries(questions)
    .filter(([, text]) => said.has(norm(text)))
    .map(([name]) => `operatorQuestions.${name}`);
}
