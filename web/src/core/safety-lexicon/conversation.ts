/**
 * Rules-only signals for a whole conversation (tasks M.4, M.9): each of the person's turns through the
 * safety lexicon, read with the operator question just before it. Operator turns are never scored.
 * Used by the evaluation runner, the admin "simulate" tool and the outcomes script. Pure.
 */
import { answerSignals, mergeSignals, withPreviousQuestion } from "./answers";
import { lexiconSignals, type LexiconSignals } from "./engine";

export function conversationSignals(turns: readonly { sender: "VICTIM" | "OPERATOR"; text: string }[]): (LexiconSignals & { text: string; question: string | null })[] {
  return withPreviousQuestion(turns).map(({ text, question }) => ({ ...mergeSignals(lexiconSignals(text), answerSignals(question, text)), text, question }));
}
