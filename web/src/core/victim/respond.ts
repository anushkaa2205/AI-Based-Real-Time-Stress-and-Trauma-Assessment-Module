/** Builds victim turn responses; always parsed through the strict contracts (rule 1). */
import { TurnResponse, type Prompt } from "@/contracts/victim";
import { nextStep, promptFor } from "@/core/conversation/flow";
import type { RunResult } from "@/core/pipeline/run";
import { emergencyPanel } from "./emergency";
import { currentTurn } from "./service";

/** Next prompt after a pipeline run, without another database read (except for replays). */
export async function turnAfter(interactionId: string, run: RunResult): Promise<{ prompt: Prompt; show: boolean; lang: "en" | "hi" }> {
  if (!run.turn) {
    const t = await currentTurn(interactionId);
    return { prompt: t.prompt, show: t.showEmergencyPanel, lang: t.lang };
  }
  const { lang, ...facts } = run.turn;
  return { prompt: promptFor(nextStep(facts), lang), show: run.showEmergencyPanel, lang };
}

export async function turnResponse(interactionId: string, run?: RunResult) {
  const t = run ? await turnAfter(interactionId, run) : await currentTurn(interactionId).then((c) => ({ prompt: c.prompt, show: c.showEmergencyPanel, lang: c.lang }));
  return TurnResponse.parse({
    next: t.prompt,
    showEmergencyPanel: t.show,
    emergency: t.show ? emergencyPanel(t.lang) : null,
  });
}
