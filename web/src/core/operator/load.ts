/**
 * Loads what the question rules need for one interaction (tasks 7.5, P.3): the latest dimension scores,
 * whether OV-9 fired, the questions already asked and how many turns there are. Shared by the operator
 * console's suggested questions and the integration next-question endpoint, so both read the same state.
 */
import type { VictimLang } from "@/contracts/interaction";
import { decrypt } from "@/core/privacy/crypto";
import type { Dimension } from "@/core/scoring/types";
import { Assessment, Message } from "@/models";
import { askedKeys } from "./asked";
import type { NextQuestionInput } from "./suggest";

export async function loadQuestionInput(interactionId: string, lang: VictimLang): Promise<NextQuestionInput> {
  const [latest, turns, operatorTurns] = await Promise.all([
    Assessment.findOne({ interactionId }).sort({ seq: -1 }).select("dimensions overridesFired").lean(),
    Message.countDocuments({ interactionId }),
    Message.find({ interactionId, sender: "OPERATOR" }).sort({ seq: 1 }).select("textEnc").lean(),
  ]);
  const raw = (latest?.dimensions instanceof Map ? Object.fromEntries(latest.dimensions) : latest?.dimensions) as Record<string, { score?: number }> | undefined;
  const dimensions: Partial<Record<Dimension, number>> = {};
  for (const [k, v] of Object.entries(raw ?? {})) if (v?.score != null) dimensions[k as Dimension] = v.score;
  const texts: string[] = [];
  for (const m of operatorTurns) {
    try {
      texts.push(decrypt(m.textEnc as string));
    } catch {
      // A turn that cannot be read (key rotated out) simply does not count as asked.
    }
  }
  return {
    dimensions,
    suicideSignal: (dimensions.SUICIDAL_IDEATION ?? 0) > 0,
    notSafeNow: (latest?.overridesFired ?? []).includes("OV-9"),
    asked: askedKeys(lang, texts),
    turns,
  };
}
