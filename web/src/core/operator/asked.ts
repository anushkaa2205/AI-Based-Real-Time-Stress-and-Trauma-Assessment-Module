/**
 * Which scripted questions were already asked in an interaction (tasks P.3, P.11; plan §8.2,
 * API_CONTRACTS §6.7, §6.8). Pure: the OPERATOR turns' text in, `operatorQuestions.*` keys out.
 * A turn counts as a question when it equals that question's scripted wording in **any** of the
 * five languages (spacing and case ignored), so a question asked before the conversation's
 * language was changed still counts as asked and is not suggested again.
 */
import { VICTIM_LANGS } from "@/contracts/interaction";
import { MESSAGES } from "@/core/i18n/messages";

const norm = (s: string) => s.normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase();

/** Normalised scripted wording → its key, for every language (built once). */
const BY_TEXT: ReadonlyMap<string, string> = (() => {
  const m = new Map<string, string>();
  for (const lang of VICTIM_LANGS) {
    for (const [name, text] of Object.entries(MESSAGES[lang].operatorQuestions as Record<string, string>)) {
      const k = norm(text);
      if (!m.has(k)) m.set(k, `operatorQuestions.${name}`);
    }
  }
  return m;
})();

/** The scripted question's key for one OPERATOR turn, or null when it is not a scripted question. */
export function questionKeyOf(text: string): string | null {
  return BY_TEXT.get(norm(text)) ?? null;
}

/** The keys of the scripted questions in these turns, in the order first asked, each once. */
export function askedKeys(operatorTurns: readonly string[]): string[] {
  const out: string[] = [];
  for (const t of operatorTurns) {
    const k = questionKeyOf(t);
    if (k && !out.includes(k)) out.push(k);
  }
  return out;
}
