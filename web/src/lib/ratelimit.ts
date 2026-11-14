/**
 * Fixed-window rate limiting backed by MongoDB (task 1.9, NFR-SEC-04,
 * API_CONTRACTS §1 "Rate limits"). Counters expire through a TTL index.
 * Keys are SHA-256 hashes, so raw IPs and ids are never stored.
 */
import { createHash } from "node:crypto";
import { RateLimit } from "@/models/rate-limit";

export interface Limit {
  limit: number;
  windowMs: number;
}

export const LIMITS = {
  /** Staff: 300 requests/min per user */
  staff: { limit: 300, windowMs: 60_000 },
  /** Victim: 30 requests/min per session */
  victimSession: { limit: 30, windowMs: 60_000 },
  /** Victim: 10 new sessions/hour per IP */
  victimSessionsPerIp: { limit: 10, windowMs: 3_600_000 },
  /** Staff login attempts: 10/min per IP and per e-mail */
  login: { limit: 10, windowMs: 60_000 },
} as const satisfies Record<string, Limit>;

export interface RateLimitStore {
  /** Atomically increments the counter for (key, window) and returns the new count. */
  hit(key: string, windowStart: Date, expiresAt: Date): Promise<number>;
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  /** seconds until the window resets */
  resetSec: number;
}

export function windowStartMs(nowMs: number, windowMs: number): number {
  return nowMs - (nowMs % windowMs);
}

export function rateKey(scope: string, subject: string): string {
  return createHash("sha256").update(`${scope}:${subject}`).digest("hex");
}

export async function checkRateLimit(
  store: RateLimitStore,
  key: string,
  { limit, windowMs }: Limit,
  nowMs: number,
): Promise<RateLimitResult> {
  const start = windowStartMs(nowMs, windowMs);
  const end = start + windowMs;
  // Keep the counter one extra window, then MongoDB's TTL monitor removes it.
  const count = await store.hit(key, new Date(start), new Date(end + windowMs));
  return {
    allowed: count <= limit,
    limit,
    remaining: Math.max(0, limit - count),
    resetSec: Math.max(1, Math.ceil((end - nowMs) / 1000)),
  };
}

export function rateLimitHeaders(r: RateLimitResult): Record<string, string> {
  const h: Record<string, string> = {
    "RateLimit-Limit": String(r.limit),
    "RateLimit-Remaining": String(r.remaining),
    "RateLimit-Reset": String(r.resetSec),
  };
  if (!r.allowed) h["Retry-After"] = String(r.resetSec);
  return h;
}

export const mongoRateLimitStore: RateLimitStore = {
  async hit(key, windowStart, expiresAt) {
    const doc = await RateLimit.findOneAndUpdate(
      { key, windowStart },
      { $inc: { count: 1 }, $setOnInsert: { expiresAt } },
      { upsert: true, returnDocument: "after", projection: { count: 1 } },
    ).lean();
    return doc?.count ?? 1;
  },
};

/** Client IP from the proxy headers (Vercel sets x-forwarded-for). */
export function clientIp(headers: Headers): string {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip") || "unknown";
}
