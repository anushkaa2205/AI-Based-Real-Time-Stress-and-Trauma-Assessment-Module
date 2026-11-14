/** PATCH /api/v1/staff/follow-ups/{id}: record the outcome (task 6.7, FR-REC-09). */
import { FollowUpPatch } from "@/contracts/staff";
import { updateFollowUp } from "@/core/followups/service";
import { route } from "@/lib/route";

export const PATCH = route({ auth: "staff", action: "followup.manage", body: FollowUpPatch }, async ({ user, params, body }) =>
  updateFollowUp(user, String(params.id), body),
);
