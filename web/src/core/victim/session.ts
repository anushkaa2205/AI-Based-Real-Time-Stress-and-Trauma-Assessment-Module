/**
 * Victim session tokens (task 3.2, FR-CH-07/09, ARCHITECTURE §9).
 * No login: a random 256-bit token in an HttpOnly cookie, bound to ONE
 * interaction. Only its SHA-256 hash is stored. 2-hour sliding expiry.
 */
import { createHash, randomBytes } from "node:crypto";

export const VICTIM_COOKIE = "nhaa_vs";
export const VICTIM_HEADER = "x-victim-session";
export const SESSION_TTL_MS = 2 * 60 * 60 * 1000;

export function newSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function sessionCookie(token: string, secure: boolean) {
  return {
    name: VICTIM_COOKIE,
    value: token,
    httpOnly: true,
    secure,
    sameSite: "strict" as const,
    path: "/api/v1/victim",
    maxAge: SESSION_TTL_MS / 1000,
  };
}
