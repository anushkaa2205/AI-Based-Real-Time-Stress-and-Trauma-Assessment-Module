/**
 * Short-lived "password OK, TOTP pending" token between the two login steps
 * (API_CONTRACTS §5.1: POST /auth/login → POST /auth/totp). HMAC-signed,
 * bound to one user, expires after 5 minutes. Pure: secret and clock passed in.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export const PENDING_TTL_MS = 5 * 60 * 1000;
export const PENDING_COOKIE = "nhaa_totp_pending";

function sign(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(`totp-pending:${payload}`).digest("base64url");
}

export function createPendingToken(secret: string, userId: string, nowMs: number): string {
  const payload = `${userId}.${nowMs + PENDING_TTL_MS}`;
  return `${payload}.${sign(secret, payload)}`;
}

/** Returns the user id if the token is genuine and not expired, else null. */
export function verifyPendingToken(secret: string, token: string, nowMs: number): string | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [userId, expStr, sig] = parts as [string, string, string];
  const expected = Buffer.from(sign(secret, `${userId}.${expStr}`));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || nowMs > exp) return null;
  return /^[a-f0-9]{24}$/.test(userId) ? userId : null;
}
