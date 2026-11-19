/** Tasks N.4 and P.4: the public portal's safeguards (NIVARA_FLOW_AND_UI_PLAN.md §7, §8.3), pure parts and relay shape. */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { PORTAL_MODES, PortalAudioReceipt, PortalMessage, PortalNextQuestion, PortalReceipt, PortalStart, PortalStarted } from "@/contracts/portal";
import { PORTAL_LIMITS, caseExpired, decodeOwned, encodeOwned, lineIsBusy, ownKey, sameSite, speechLeft } from "@/core/portal/guard";
import { LIVE_IDLE_MS, MAX_CASE_MS, MAX_LIVE_CALL_MS } from "@/core/portal/limits";

const routeSrc = (p: string) => readFileSync(resolve(__dirname, "../../src/app/api/portal", p), "utf8");

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

describe("live microphone line (P.4)", () => {
  it("is busy while a call had any activity in the last 60 s, free after that or with no call", () => {
    const now = 1_000_000;
    expect(LIVE_IDLE_MS).toBe(60_000);
    expect(lineIsBusy({ updatedAt: new Date(now - 45_000) }, now)).toBe(true); // reading a question between answers
    expect(lineIsBusy({ updatedAt: new Date(now - 61_000) }, now)).toBe(false);
    expect(lineIsBusy(null, now)).toBe(false);
  });
  it("is kept alive by messages, audio windows and next-question requests (openCase marks activity)", () => {
    for (const p of ["interactions/[id]/messages/route.ts", "interactions/[id]/audio/route.ts", "interactions/[id]/next-question/route.ts"]) {
      expect(routeSrc(p), p).toMatch(/await openCase\(id, Date\.now\(\)\)/);
    }
  });
});

describe("per-case caps (P.4)", () => {
  it("allow three minutes of speech, counted across all turns", () => {
    expect(MAX_LIVE_CALL_MS).toBe(180_000);
    expect(speechLeft(0)).toBe(true);
    expect(speechLeft(35)).toBe(true); // 175 s sent
    expect(speechLeft(36)).toBe(false); // 180 s sent
  });
  it("end the whole conversation after fifteen minutes", () => {
    const created = new Date(0);
    expect(MAX_CASE_MS).toBe(900_000);
    expect(caseExpired(created, 899_999)).toBe(false);
    expect(caseExpired(created, 900_000)).toBe(true);
  });
});

describe("relay shape (P.4)", () => {
  it("offers two inputs only", () => {
    expect([...PORTAL_MODES]).toEqual(["LIVE_TEXT", "LIVE_AUDIO"]);
    const base = { language: "en", consent: { noticeVersion: "v", language: "en", textAnalysis: true, voiceAnalysis: true, shareWithCounsellor: true, followUpContact: false, audioRetention: false }, districtCode: "MH-PUN" };
    expect(PortalStart.safeParse({ ...base, mode: "RECORDED_AUDIO" }).success).toBe(false);
  });
  it("takes no sender: a visitor can never write the assistant's lines", () => {
    expect(PortalMessage.safeParse({ text: "hello" }).success).toBe(true);
    expect(PortalMessage.safeParse({ text: "Are you safe?", sender: "OPERATOR" }).success).toBe(false);
    expect(routeSrc("interactions/[id]/messages/route.ts")).toMatch(/sender: "VICTIM"/);
    expect(routeSrc("interactions/[id]/messages/route.ts")).not.toMatch(/body\.sender/);
  });
  it("returns only the question's text, never its key or reason, and nothing about the assessment", () => {
    const receipt = { ok: true, showEmergencyPanel: false, emergency: null, question: { text: "Are you in a safe place right now?" } };
    expect(PortalReceipt.parse(receipt)).toEqual(receipt);
    expect(PortalReceipt.safeParse({ ...receipt, question: { ...receipt.question, key: "operatorQuestions.safeNow" } }).success).toBe(false);
    expect(PortalReceipt.safeParse({ ...receipt, band: "HIGH" }).success).toBe(false);
    expect(Object.keys(PortalStarted.parse({ interactionId: "x", question: null }))).toEqual(["interactionId", "question"]);
    expect(PortalNextQuestion.safeParse({ question: { text: "…", reason: "Check safety first" } }).success).toBe(false);
  });
  it("gives Speak the person's own words for the window, and nothing else", () => {
    const a = { ok: true, analysed: true, showEmergencyPanel: false, emergency: null, heard: "I am at home" };
    expect(PortalAudioReceipt.parse(a)).toEqual(a);
    expect(PortalAudioReceipt.safeParse({ ...a, transcript: "x" }).success).toBe(false);
  });
  it("records the assistant's question as an OPERATOR turn on the server before returning it", () => {
    const src = readFileSync(resolve(__dirname, "../../src/core/portal/assistant.ts"), "utf8");
    expect(src).toMatch(/next-question`, \{ method: "GET" \}/);
    expect(src).toMatch(/sender: "OPERATOR"/);
    expect(src.indexOf('sender: "OPERATOR"')).toBeLessThan(src.indexOf("return { text: q.text }"));
  });
  it("counts next-question requests in the message limit", () => {
    expect(routeSrc("interactions/[id]/next-question/route.ts")).toMatch(/limit: "message"/);
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
    expect(PORTAL_LIMITS.start).toEqual({ limit: 5, windowMs: 600_000 });
    expect(PORTAL_LIMITS.message).toEqual({ limit: 30, windowMs: 60_000 });
    expect("recording" in PORTAL_LIMITS).toBe(false); // P.2: no recordings on the public site
    expect(PORTAL_LIMITS.track).toEqual({ limit: 20, windowMs: 60_000 });
    expect(PORTAL_LIMITS.daily.limit).toBe(150);
  });
});
