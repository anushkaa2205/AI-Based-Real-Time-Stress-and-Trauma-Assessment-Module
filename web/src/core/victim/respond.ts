/** Builds victim turn responses; always parsed through the strict contracts (rule 1). */
import { TurnResponse } from "@/contracts/victim";
import { emergencyPanel } from "./emergency";
import { currentTurn } from "./service";

export async function turnResponse(interactionId: string) {
  const turn = await currentTurn(interactionId);
  return TurnResponse.parse({
    next: turn.prompt,
    showEmergencyPanel: turn.showEmergencyPanel,
    emergency: turn.showEmergencyPanel ? emergencyPanel(turn.lang) : null,
  });
}
