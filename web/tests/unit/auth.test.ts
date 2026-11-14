import { generate } from "otplib";
import { describe, expect, it } from "vitest";
import { PENDING_TTL_MS, createPendingToken, verifyPendingToken } from "@/core/auth/pending";
import { hashPassword, verifyPassword } from "@/core/auth/password";
import { newTotpSecret, roleRequiresTotp, totpUri, verifyTotp } from "@/core/auth/totp";

const secret = "test-auth-secret-at-least-32-chars!!";
const userId = "0123456789abcdef01234567";
const now = Date.UTC(2026, 10, 14, 12, 0, 0);

describe("TOTP step (task 1.6)", () => {
  it("is required for supervisor, state, ministry, admin and auditor roles only", () => {
    expect(["NHAA_SUPERVISOR", "STATE_ADMIN", "MINISTRY_ADMIN", "SYS_ADMIN", "AUDITOR"].every((r) => roleRequiresTotp(r as never))).toBe(true);
    expect(["OPERATOR", "COUNSELLOR", "DISTRICT_OFFICER", "POLICE_LIAISON", "WELFARE_OFFICER"].some((r) => roleRequiresTotp(r as never))).toBe(false);
  });

  it("accepts a current code and rejects a wrong or malformed one", async () => {
    const s = newTotpSecret();
    const code = await generate({ secret: s });
    expect(await verifyTotp(s, code)).toBe(true);
    const wrong = String((Number(code) + 1) % 1_000_000).padStart(6, "0");
    expect(await verifyTotp(s, wrong)).toBe(false);
    expect(await verifyTotp(s, "12ab56")).toBe(false);
    expect(await verifyTotp(s, "")).toBe(false);
  });

  it("builds an otpauth URI for authenticator apps", () => {
    expect(totpUri(newTotpSecret(), "test@example.org")).toMatch(/^otpauth:\/\/totp\//);
  });
});

describe("pending-login token", () => {
  it("round-trips within 5 minutes", () => {
    const t = createPendingToken(secret, userId, now);
    expect(verifyPendingToken(secret, t, now + PENDING_TTL_MS - 1)).toBe(userId);
  });

  it("expires", () => {
    const t = createPendingToken(secret, userId, now);
    expect(verifyPendingToken(secret, t, now + PENDING_TTL_MS + 1)).toBeNull();
  });

  it("rejects a token signed with another secret or edited", () => {
    const t = createPendingToken(secret, userId, now);
    expect(verifyPendingToken("another-secret-of-sufficient-length", t, now)).toBeNull();
    const [, exp, sig] = t.split(".");
    expect(verifyPendingToken(secret, `fedcba9876543210fedcba98.${exp}.${sig}`, now)).toBeNull();
    expect(verifyPendingToken(secret, `${userId}.${Number(exp) + 999999}.${sig}`, now)).toBeNull();
    expect(verifyPendingToken(secret, "garbage", now)).toBeNull();
  });
});

describe("passwords", () => {
  it("hashes with bcrypt and verifies", async () => {
    const hash = await hashPassword("synthetic-demo-password");
    expect(hash).toMatch(/^\$2[aby]\$12\$/);
    expect(await verifyPassword("synthetic-demo-password", hash)).toBe(true);
    expect(await verifyPassword("wrong", hash)).toBe(false);
  });

  it("returns false (not an error) for unknown users", async () => {
    expect(await verifyPassword("anything", null)).toBe(false);
  });
});
