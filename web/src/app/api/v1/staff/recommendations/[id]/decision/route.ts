/**
 * POST /api/v1/staff/recommendations/{id}/decision (task 6.1, FR-REC-05/07, AC-REC-03).
 * APPROVE creates the referral; REJECT needs a reason; POST_REVIEW closes the human
 * review of auto-triggered emergency support. Referral text over 300 characters → 422.
 */
import { DecisionRequest } from "@/contracts/staff";
import { decideRecommendation } from "@/core/referrals/service";
import { route } from "@/lib/route";

export const POST = route({ auth: "staff", action: "recommendation.decide", body: DecisionRequest }, async ({ user, params, body }) =>
  decideRecommendation(user, String(params.id), body),
);
