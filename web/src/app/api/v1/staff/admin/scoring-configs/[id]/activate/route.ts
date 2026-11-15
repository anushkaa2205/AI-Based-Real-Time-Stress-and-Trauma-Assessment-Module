/** POST /api/v1/staff/admin/scoring-configs/{id}/activate (task 8.6): switch the active version and re-score live interactions. */
import { activateConfig } from "@/core/admin/configs";
import { route } from "@/lib/route";

export const POST = route({ auth: "staff", action: "scoringConfig.write" }, async ({ user, params }) => activateConfig(user.id, String(params.id)));
