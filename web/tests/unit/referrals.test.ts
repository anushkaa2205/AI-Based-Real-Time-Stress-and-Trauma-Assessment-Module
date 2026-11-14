/** Referral and decision rules (tasks 6.1, 6.3, 6.7; FR-REC-05/07/08, AC-REC-03). */
import { describe, expect, it } from "vitest";
import { endOfTodayIst, MISSED_AFTER_MS } from "@/core/followups/schedule";
import {
  DEFAULT_ACTION,
  REFERRAL_TEXT_MAX,
  checkDecision,
  checkReferralText,
  checkReferralTransition,
  contactRoute,
  isOverdue,
  referralDueAt,
} from "@/core/referrals/rules";
import { SUPPORT_TYPES } from "@/models/enums";

describe("checkDecision (FR-REC-05)", () => {
  it("approving a proposal creates a referral", () => {
    expect(checkDecision({ status: "PROPOSED", postReviewed: false }, "APPROVE", undefined)).toEqual({ ok: true, nextStatus: "APPROVED", createsReferral: true });
  });
  it("rejecting needs a reason and never creates a referral", () => {
    expect(checkDecision({ status: "PROPOSED", postReviewed: false }, "REJECT", "no")).toMatchObject({ ok: false, code: "REASON_REQUIRED" });
    expect(checkDecision({ status: "PROPOSED", postReviewed: false }, "REJECT", "Already handled by phone")).toEqual({ ok: true, nextStatus: "REJECTED", createsReferral: false });
  });
  it("a decided recommendation cannot be decided again", () => {
    for (const status of ["APPROVED", "REJECTED", "SUPERSEDED", "AUTO_TRIGGERED"] as const) {
      expect(checkDecision({ status, postReviewed: false }, "APPROVE", undefined)).toMatchObject({ ok: false, code: "INVALID_TRANSITION" });
    }
  });
  it("only auto-triggered recommendations get a post-review, once", () => {
    expect(checkDecision({ status: "AUTO_TRIGGERED", postReviewed: false }, "POST_REVIEW", undefined)).toEqual({ ok: true, nextStatus: "AUTO_TRIGGERED", createsReferral: false });
    expect(checkDecision({ status: "AUTO_TRIGGERED", postReviewed: true }, "POST_REVIEW", undefined)).toMatchObject({ ok: false });
    expect(checkDecision({ status: "PROPOSED", postReviewed: false }, "POST_REVIEW", undefined)).toMatchObject({ ok: false });
  });
});

describe("checkReferralText (C-ETH-02, REFERRAL_TOO_DETAILED)", () => {
  it("has a non-clinical default action for every support type", () => {
    for (const t of SUPPORT_TYPES) {
      expect(DEFAULT_ACTION[t].length).toBeGreaterThan(5);
      expect(DEFAULT_ACTION[t]).not.toMatch(/svi|suicid|trauma|depress|score/i);
      expect(checkReferralText(t, undefined)).toEqual({ ok: true, actionRequested: DEFAULT_ACTION[t] });
    }
  });
  it("trims input and keeps a short location hint", () => {
    expect(checkReferralText("POLICE_INTERVENTION", { actionRequested: "  Visit today  ", locationHint: " Ward 7 " })).toEqual({
      ok: true,
      actionRequested: "Visit today",
      locationHint: "Ward 7",
    });
  });
  it("rejects text over 300 characters", () => {
    expect(checkReferralText("LEGAL_AID", { actionRequested: "x".repeat(REFERRAL_TEXT_MAX) })).toMatchObject({ ok: true });
    expect(checkReferralText("LEGAL_AID", { actionRequested: "x".repeat(REFERRAL_TEXT_MAX + 1) })).toMatchObject({ ok: false });
    expect(checkReferralText("LEGAL_AID", { locationHint: "y".repeat(REFERRAL_TEXT_MAX + 1) })).toMatchObject({ ok: false });
  });
  it("routes contact through the NHAA desk, never a personal number", () => {
    expect(contactRoute("NHAA-2026-MH-000001")).toBe("Via NHAA 14566 desk, quote NHAA-2026-MH-000001");
  });
});

describe("checkReferralTransition (FR-REC-08)", () => {
  it("follows PENDING → ACCEPTED → IN_PROGRESS → DONE", () => {
    expect(checkReferralTransition("PENDING", "ACCEPTED")).toEqual({ ok: true });
    expect(checkReferralTransition("ACCEPTED", "IN_PROGRESS")).toEqual({ ok: true });
    expect(checkReferralTransition("IN_PROGRESS", "DONE")).toEqual({ ok: true });
  });
  it("blocks skipping steps and going backwards", () => {
    expect(checkReferralTransition("PENDING", "DONE")).toMatchObject({ ok: false, code: "INVALID_TRANSITION" });
    expect(checkReferralTransition("IN_PROGRESS", "ACCEPTED")).toMatchObject({ ok: false, code: "INVALID_TRANSITION" });
    expect(checkReferralTransition("DONE", "DECLINED", "too late now")).toMatchObject({ ok: false, code: "INVALID_TRANSITION" });
  });
  it("declining any open referral needs a reason", () => {
    for (const from of ["PENDING", "ACCEPTED", "IN_PROGRESS"] as const) {
      expect(checkReferralTransition(from, "DECLINED")).toMatchObject({ ok: false, code: "REASON_REQUIRED" });
      expect(checkReferralTransition(from, "DECLINED", "Outside our jurisdiction")).toEqual({ ok: true });
    }
  });
});

describe("due times", () => {
  const now = new Date("2026-11-15T10:00:00Z");
  it("keeps the recommendation's due time if still ahead, else uses the SLA", () => {
    const later = new Date("2026-11-15T12:00:00Z");
    expect(referralDueAt("WITHIN_24_H", later, now)).toEqual(later);
    expect(referralDueAt("WITHIN_24_H", new Date("2026-11-14T00:00:00Z"), now)?.toISOString()).toBe("2026-11-16T10:00:00.000Z");
    expect(referralDueAt("NONE", null, now)).toBeUndefined();
  });
  it("overdue means past due and still open", () => {
    const past = new Date("2026-11-15T09:00:00Z");
    expect(isOverdue({ status: "PENDING", dueAt: past }, now)).toBe(true);
    expect(isOverdue({ status: "DONE", dueAt: past }, now)).toBe(false);
    expect(isOverdue({ status: "PENDING", dueAt: null }, now)).toBe(false);
  });
  it("'today' ends at midnight India time", () => {
    expect(endOfTodayIst(new Date("2026-11-15T10:00:00Z")).toISOString()).toBe("2026-11-15T18:30:00.000Z");
    // 20:00 UTC is already 01:30 next day in India.
    expect(endOfTodayIst(new Date("2026-11-15T20:00:00Z")).toISOString()).toBe("2026-11-16T18:30:00.000Z");
    expect(MISSED_AFTER_MS).toBe(86_400_000);
  });
});
