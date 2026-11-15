/** POST /api/v1/staff/admin/scoring-configs/{id}/activate (task 8.6): switch the active version and re-score live interactions. */
import { after } from "next/server";
import { activateConfig } from "@/core/admin/configs";
import { route } from "@/lib/route";

export const POST = route({ auth: "staff", action: "scoringConfig.write" }, async ({ user, params }) => {
  const r = await activateConfig(user.id, String(params.id));
  // Re-scoring live interactions can take a while: it runs after the response.
  after(() => r.rescore().catch(() => undefined));
  return { version: r.version, rescoring: r.rescoring };
});
