/** POST /api/v1/victim/interactions/{id}/consent/withdraw (API_CONTRACTS §3.4, FR-CON-04). */
import { WithdrawRequest, WithdrawResponse } from "@/contracts/victim";
import { withdrawConsent } from "@/core/victim/service";
import { route } from "@/lib/route";

export const POST = route({ auth: "victim", body: WithdrawRequest }, async ({ victim }) =>
  WithdrawResponse.parse(await withdrawConsent(victim.interactionId)),
);
