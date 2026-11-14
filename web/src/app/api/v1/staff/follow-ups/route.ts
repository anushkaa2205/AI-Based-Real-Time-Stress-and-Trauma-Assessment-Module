/** GET /api/v1/staff/follow-ups (task 6.7, API_CONTRACTS §5.7, FR-REC-09). */
import { FollowUpQuery } from "@/contracts/staff";
import { listFollowUps } from "@/core/followups/service";
import { route } from "@/lib/route";

export const GET = route({ auth: "staff", action: "followup.manage", query: FollowUpQuery }, async ({ user, query }) => listFollowUps(user, query));
