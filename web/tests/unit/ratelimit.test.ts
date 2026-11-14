import { describe, expect, it } from "vitest";
import { checkRateLimit, rateKey, rateLimitHeaders, windowStartMs, type RateLimitStore } from "@/lib/ratelimit";

class MemoryStore implements RateLimitStore {
  counts = new Map<string, number>();
  async hit(key: string, windowStart: Date) {
    const k = `${key}@${windowStart.getTime()}`;
    const n = (this.counts.get(k) ?? 0) + 1;
    this.counts.set(k, n);
    return n;
  }
}

const limit = { limit: 3, windowMs: 60_000 };
const t0 = Date.UTC(2026, 10, 14, 12, 0, 10); // 10 s into a minute

describe("fixed-window rate limit (task 1.9)", () => {
  it("aligns windows to the window size", () => {
    expect(windowStartMs(t0, 60_000)).toBe(Date.UTC(2026, 10, 14, 12, 0, 0));
  });

  it("allows up to the limit, then blocks with Retry-After", async () => {
    const store = new MemoryStore();
    const results = [];
    for (let i = 0; i < 4; i++) results.push(await checkRateLimit(store, "k", limit, t0));
    expect(results.map((r) => r.allowed)).toEqual([true, true, true, false]);
    expect(results.map((r) => r.remaining)).toEqual([2, 1, 0, 0]);
    const h = rateLimitHeaders(results[3]!);
    expect(h["Retry-After"]).toBe("50");
    expect(h["RateLimit-Limit"]).toBe("3");
    expect(rateLimitHeaders(results[0]!)["Retry-After"]).toBeUndefined();
  });

  it("starts again in the next window", async () => {
    const store = new MemoryStore();
    for (let i = 0; i < 4; i++) await checkRateLimit(store, "k", limit, t0);
    expect((await checkRateLimit(store, "k", limit, t0 + 60_000)).allowed).toBe(true);
  });

  it("counts keys separately", async () => {
    const store = new MemoryStore();
    for (let i = 0; i < 3; i++) await checkRateLimit(store, "a", limit, t0);
    expect((await checkRateLimit(store, "b", limit, t0)).allowed).toBe(true);
  });

  it("hashes keys so raw IPs are never stored", () => {
    const key = rateKey("login-ip", "203.0.113.7");
    expect(key).toMatch(/^[a-f0-9]{64}$/);
    expect(key).not.toContain("203.0.113.7");
    expect(rateKey("login-ip", "203.0.113.7")).toBe(key);
    expect(rateKey("staff", "203.0.113.7")).not.toBe(key);
  });
});
