/** GET /api/v1/victim/interactions/{id}/next: current prompt, for reloads and resume (§3.5). */
import { NextResponse } from "@/contracts/victim";
import { emergencyPanel } from "@/core/victim/emergency";
import { currentTurn } from "@/core/victim/service";
import { route } from "@/lib/route";

export const GET = route({ auth: "victim" }, async ({ victim }) => {
  const turn = await currentTurn(victim.interactionId);
  return NextResponse.parse({
    prompt: turn.prompt,
    showEmergencyPanel: turn.showEmergencyPanel,
    emergency: turn.showEmergencyPanel ? emergencyPanel(turn.lang) : null,
  });
});
