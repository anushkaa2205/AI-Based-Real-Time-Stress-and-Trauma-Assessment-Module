/** Task N.4: the public demo's safeguards (NIVARA_FLOW_AND_UI_PLAN.md §7), pure parts. */
import { describe, expect, it } from "vitest";
import { DEMO_LIMITS, decodeOwned, encodeOwned, lineIsBusy, ownKey, sameSite } from "@/core/demo/guard";

const key = ownKey("a-test-secret-that-is-long-enough-123456");
const a = "aaaaaaaaaaaaaaaaaaaaaaaa";
const b = "bbbbbbbbbbbbbbbbbbbbbbbb";

describe("own-cases cookie", () => {
  it("round-trips the browser's case ids", () => {
    expect(decodeOwned(encodeOwned([a, b], key), key)).toEqual([a, b]);
  });
  it("rejects a cookie signed with another key, a tampered one and junk", () => {
    const other = ownKey("another-secret-that-is-long-enough-7890");
    expect(decodeOwned(encodeOwned([a], other), key)).toEqual([]);
    const c = encodeOwned([a], key);
    const tampered = Buffer.from(b).toString("base64url") + c.slice(c.indexOf("."));
    expect(decodeOwned(tampered, key)).toEqual([]);
    expect(decodeOwned("nonsense", key)).toEqual([]);
    expect(decodeOwned(undefined, key)).toEqual([]);
  });
  it("keeps only the newest twenty", () => {
    const ids = Array.from({ length: 25 }, (_, i) => i.toString(16).padStart(24, "0"));
    const out = decodeOwned(encodeOwned(ids, key), key);
    expect(out).toHaveLength(20);
    expect(out[19]).toBe(ids[24]);
  });
});

describe("live microphone line", () => {
  it("is busy while a call had audio in the last 20 s, free after that or with no call", () => {
    const now = 1_000_000;
    expect(lineIsBusy({ updatedAt: new Date(now - 5_000) }, now)).toBe(true);
    expect(lineIsBusy({ updatedAt: new Date(now - 25_000) }, now)).toBe(false);
    expect(lineIsBusy(null, now)).toBe(false);
  });
});

describe("same-site check", () => {
  it("accepts only a matching Origin", () => {
    expect(sameSite(new Headers({ origin: "https://nivara.example", host: "nivara.example" }))).toBe(true);
    expect(sameSite(new Headers({ origin: "https://nivara.example", "x-forwarded-host": "nivara.example", host: "internal" }))).toBe(true);
    expect(sameSite(new Headers({ origin: "https://evil.example", host: "nivara.example" }))).toBe(false);
    expect(sameSite(new Headers({ host: "nivara.example" }))).toBe(false);
    expect(sameSite(new Headers({ origin: "not a url", host: "nivara.example" }))).toBe(false);
  });
});

describe("limits", () => {
  it("match the plan's starting values", () => {
    expect(DEMO_LIMITS.start).toEqual({ limit: 5, windowMs: 600_000 });
    expect(DEMO_LIMITS.message).toEqual({ limit: 30, windowMs: 60_000 });
    expect(DEMO_LIMITS.recording).toEqual({ limit: 3, windowMs: 600_000 });
    expect(DEMO_LIMITS.track).toEqual({ limit: 20, windowMs: 60_000 });
    expect(DEMO_LIMITS.daily.limit).toBe(150);
  });
});
