/** POST /api/v1/staff/cases/{id}/follow-ups → 201 (task 6.7, FR-REC-09). A reminder job fires when it is due. */
import { FollowUpCreate } from "@/contracts/staff";
import { createFollowUp } from "@/core/followups/service";
import { route } from "@/lib/route";

export const POST = route({ auth: "staff", action: "followup.manage", body: FollowUpCreate }, async ({ user, params, body }) =>
  Response.json(await createFollowUp(user, String(params.id), body), { status: 201 }),
);
