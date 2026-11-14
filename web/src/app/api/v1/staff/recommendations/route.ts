/** GET /api/v1/staff/recommendations: approval inbox (task 6.1, API_CONTRACTS §5.5, FR-REC-05). */
import { RecommendationQuery } from "@/contracts/staff";
import { recommendationInbox } from "@/core/referrals/service";
import { route } from "@/lib/route";

export const GET = route({ auth: "staff", action: "recommendation.decide", query: RecommendationQuery }, async ({ user, query }) =>
  recommendationInbox(user, query),
);
