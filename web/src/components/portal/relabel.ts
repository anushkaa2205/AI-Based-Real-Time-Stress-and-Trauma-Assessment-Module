/** Pure helper for the portal's language switch (task P.11, plan §6.7). */
export interface RelabelTurn {
  who: "assistant" | "person";
  text: string;
  closing?: boolean;
}

/**
 * Task P.11: replaces the assistant's question lines, in order, with the same questions in the new
 * language. The person's words and the scripted closing line (translated on the page) are left alone,
 * and a line with no counterpart keeps its text.
 */
export function relabel<T extends RelabelTurn>(turns: readonly T[], questions: readonly string[]): T[] {
  let i = 0;
  return turns.map((t) => {
    if (t.who !== "assistant" || t.closing) return t;
    const text = questions[i++];
    return text ? { ...t, text } : t;
  });
}
