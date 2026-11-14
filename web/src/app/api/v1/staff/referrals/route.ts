/** GET /api/v1/staff/referrals (task 6.3, FR-REC-07/08). Police and welfare: own role and district only. */
import { ReferralQuery } from "@/contracts/staff";
import { listReferrals } from "@/core/referrals/service";
import { route } from "@/lib/route";

export const GET = route({ auth: "staff", action: "referral.list", query: ReferralQuery }, async ({ user, query }) => listReferrals(user, query));
