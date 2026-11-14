/** GET /api/v1/victim/consent-notices/{version}?lang=hi (API_CONTRACTS §3.2). */
import { z } from "zod";
import { ConsentNotice, VictimLang } from "@/contracts/victim";
import { NOTICE_VERSION } from "@/core/consent/mode";
import { consentNotice } from "@/core/victim/service";
import { ApiError } from "@/lib/problem";
import { route } from "@/lib/route";

export const GET = route({ auth: "public", rateLimit: false, query: z.object({ lang: VictimLang.default("en") }) }, async ({ params, query }) => {
  if (params.version !== NOTICE_VERSION) throw new ApiError("NOT_FOUND");
  return ConsentNotice.parse(consentNotice(query.lang));
});
