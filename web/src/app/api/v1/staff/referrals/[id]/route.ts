/**
 * GET   /api/v1/staff/referrals/{id} → ReferralDto (task 6.3), the only case data police/welfare get.
 * PATCH /api/v1/staff/referrals/{id}: PENDING → ACCEPTED → IN_PROGRESS → DONE, or DECLINED with a reason (FR-REC-08).
 */
import { ReferralPatch } from "@/contracts/staff";
import { getReferral, updateReferral } from "@/core/referrals/service";
import { route } from "@/lib/route";

export const GET = route({ auth: "staff", action: "referral.list" }, async ({ user, params }) => getReferral(user, String(params.id)));

export const PATCH = route({ auth: "staff", action: "referral.update", body: ReferralPatch }, async ({ user, params, body }) =>
  updateReferral(user, String(params.id), body),
);
