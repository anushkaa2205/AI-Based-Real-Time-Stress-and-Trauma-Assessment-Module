/** POST /api/v1/staff/auth/login (API_CONTRACTS §5.1, task 1.6). */
import { cookies } from "next/headers";
import { signIn } from "@/auth";
import { LoginRequest } from "@/contracts/staff";
import { checkPassword } from "@/core/auth/login";
import { PENDING_COOKIE, PENDING_TTL_MS, createPendingToken } from "@/core/auth/pending";
import { env } from "@/lib/env";
import { ApiError } from "@/lib/problem";
import { LIMITS, clientIp } from "@/lib/ratelimit";
import { route } from "@/lib/route";

export const POST = route(
  {
    auth: "public",
    body: LoginRequest,
    rateLimit: { limit: LIMITS.login, key: (req) => `login-ip:${clientIp(req.headers)}` },
  },
  async ({ body }) => {
    const checked = await checkPassword(body.email, body.password);
    if (!checked) throw new ApiError("UNAUTHENTICATED", "E-mail or password is not correct");

    if (!checked.requiresTotp) {
      await signIn("credentials", { email: body.email, password: body.password, redirect: false });
      return { requiresTotp: false };
    }

    const jar = await cookies();
    jar.set(PENDING_COOKIE, createPendingToken(env().AUTH_SECRET, checked.user.id, Date.now()), {
      httpOnly: true,
      secure: env().NODE_ENV === "production",
      sameSite: "strict",
      path: "/api/v1/staff/auth",
      maxAge: PENDING_TTL_MS / 1000,
    });
    return { requiresTotp: true };
  },
);
