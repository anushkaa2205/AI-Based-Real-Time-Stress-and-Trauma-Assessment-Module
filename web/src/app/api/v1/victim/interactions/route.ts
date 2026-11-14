/** POST /api/v1/victim/interactions: start a session (API_CONTRACTS §3.1, task 3.2). */
import { cookies } from "next/headers";
import { StartRequest, StartResponse } from "@/contracts/victim";
import { t } from "@/core/i18n/messages";
import { sessionCookie } from "@/core/victim/session";
import { QUICK_EXIT_URL, consentNotice, startInteraction } from "@/core/victim/service";
import { env } from "@/lib/env";
import { LIMITS, clientIp } from "@/lib/ratelimit";
import { route } from "@/lib/route";

export const POST = route(
  {
    auth: "public",
    body: StartRequest,
    // 10 new sessions per hour per IP (API_CONTRACTS §1)
    rateLimit: { limit: LIMITS.victimSessionsPerIp, key: (req) => `victim-start:${clientIp(req.headers)}` },
  },
  async ({ body }) => {
    const started = await startInteraction({
      channel: body.channel,
      language: body.language,
      docketNumber: body.docketNumber ?? null,
      districtCode: body.districtCode ?? null,
    });
    (await cookies()).set(sessionCookie(started.token, env().NODE_ENV === "production"));
    const res = StartResponse.parse({
      interactionId: started.interactionId,
      docketNumber: started.docketNumber,
      // Browsers use the HttpOnly cookie; only keypad/API channels get the token in the body.
      ...(body.channel === "IVRS" ? { sessionToken: started.token } : {}),
      consentNotice: consentNotice(body.language),
      aiDisclosure: t(body.language, "start.aiDisclosure"),
      quickExitUrl: QUICK_EXIT_URL,
    });
    return Response.json(res, { status: 201 });
  },
);
