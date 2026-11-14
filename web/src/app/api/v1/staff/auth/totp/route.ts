/** POST /api/v1/staff/auth/totp (API_CONTRACTS §5.1, task 1.6). */
import { AuthError } from "next-auth";
import { cookies } from "next/headers";
import { signIn } from "@/auth";
import { TotpRequest } from "@/contracts/staff";
import { PENDING_COOKIE, verifyPendingToken } from "@/core/auth/pending";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { ApiError } from "@/lib/problem";
import { LIMITS, clientIp } from "@/lib/ratelimit";
import { route } from "@/lib/route";
import { User } from "@/models/user";

export const POST = route(
  {
    auth: "public",
    body: TotpRequest,
    rateLimit: { limit: LIMITS.login, key: (req) => `totp-ip:${clientIp(req.headers)}` },
  },
  async ({ body }) => {
    const jar = await cookies();
    const pendingToken = jar.get(PENDING_COOKIE)?.value ?? "";
    const userId = verifyPendingToken(env().AUTH_SECRET, pendingToken, Date.now());
    if (!userId) throw new ApiError("SESSION_EXPIRED", "Please sign in again");

    try {
      await signIn("credentials", { pendingToken, code: body.code, redirect: false });
    } catch (err) {
      if (err instanceof AuthError) throw new ApiError("TOTP_REQUIRED", "The authenticator code is not correct");
      throw err;
    }
    jar.delete({ name: PENDING_COOKIE, path: "/api/v1/staff/auth" });

    await db();
    const u = await User.findById(userId).lean();
    if (!u) throw new ApiError("SESSION_EXPIRED");
    return {
      user: {
        id: String(u._id),
        name: u.name,
        role: u.role,
        districtId: u.districtId ? String(u.districtId) : null,
        stateId: u.stateId ? String(u.stateId) : null,
      },
    };
  },
);
