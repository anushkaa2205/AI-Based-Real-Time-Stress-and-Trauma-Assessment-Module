/**
 * The public demo's safeguards, pure parts (NIVARA_FLOW_AND_UI_PLAN.md §7, task N.4): limits,
 * the signed own-cases cookie, the live-line rule and the same-site check. No Next.js imports,
 * so they are unit-tested directly; `./public` wires them into the route wrapper.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import type { Limit } from "@/lib/ratelimit";

/** Starting values from the plan (§7). Named here so they are easy to tune after the first deployment. */
export const DEMO_LIMITS = {
  /** New cases per visitor */
  start: { limit: 5, windowMs: 10 * 60_000 },
  /** Text messages per visitor */
  message: { limit: 30, windowMs: 60_000 },
  /** Recordings (library or upload) per visitor */
  recording: { limit: 3, windowMs: 10 * 60_000 },
  /** Live microphone windows per visitor: 5 s windows for a 3-minute call, with headroom */
  audio: { limit: 60, windowMs: 60_000 },
  /** Tracking lookups per visitor */
  track: { limit: 20, windowMs: 60_000 },
  /** Everything else (library, end) */
  other: { limit: 60, windowMs: 60_000 },
  /** Demo cases per day across all visitors */
  daily: { limit: 150, windowMs: 24 * 60 * 60_000 },
} as const satisfies Record<string, Limit>;

/** Per-case caps (§7) */
export const MAX_MESSAGES_PER_CASE = 40;
export const MAX_LIVE_CALL_MS = 3 * 60_000;
/** A live call with no audio window for this long counts as over and frees the line. */
export const LIVE_IDLE_MS = 20_000;

export const OWN_COOKIE = "nivara_demo";
const OWN_MAX = 20;
export const OWN_MAX_AGE_SEC = 24 * 60 * 60;

export function ownKey(secret: string): Buffer {
  return createHmac("sha256", secret).update("nivara-demo-own").digest();
}

function sign(payload: string, key: Buffer): string {
  return createHmac("sha256", key).update(payload).digest("base64url");
}

/** `<base64url ids>.<signature>`; the newest case last, at most OWN_MAX kept. */
export function encodeOwned(ids: string[], key: Buffer): string {
  const payload = Buffer.from(ids.slice(-OWN_MAX).join(","), "utf8").toString("base64url");
  return `${payload}.${sign(payload, key)}`;
}

export function decodeOwned(cookie: string | undefined | null, key: Buffer): string[] {
  if (!cookie) return [];
  const dot = cookie.lastIndexOf(".");
  if (dot <= 0) return [];
  const payload = cookie.slice(0, dot);
  const given = Buffer.from(cookie.slice(dot + 1), "base64url");
  const want = Buffer.from(sign(payload, key), "base64url");
  if (given.length !== want.length || !timingSafeEqual(given, want)) return [];
  return Buffer.from(payload, "base64url")
    .toString("utf8")
    .split(",")
    .filter((id) => /^[a-f0-9]{24}$/.test(id));
}

/** The live microphone line rule (§7): busy while a call is active and had audio recently. */
export function lineIsBusy(active: { updatedAt: Date } | null, nowMs: number, idleMs = LIVE_IDLE_MS): boolean {
  return !!active && nowMs - active.updatedAt.getTime() < idleMs;
}

/** Same-site only (§7): a browser sends Origin on every POST; it must be this site. */
export function sameSite(headers: Headers): boolean {
  const origin = headers.get("origin");
  const host = headers.get("x-forwarded-host") ?? headers.get("host");
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
