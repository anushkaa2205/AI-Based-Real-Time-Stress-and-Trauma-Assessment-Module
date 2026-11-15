/** Simulator case library (task S.2, FR-SIM-02, AC-SIM-02): schema, case checks, library coverage. */
import { describe, expect, it } from "vitest";
import { apiLanguage, SimCaseSchema, type SimCase } from "@/contracts/simulator";
import { checkCase, checkLibrary, keyValue } from "@/core/simulator/cases";
import { loadSimCases } from "@/core/simulator/load";
import { ITEM_BY_CODE } from "@/core/screeners/items";

const base = {
  id: "C10",
  title: "Routine follow-up message",
  channel: "MOBILE_APP",
  language: "en",
  districtCode: "MH-NAG",
  proves: "A second Low case for the queue contrast.",
  summary: "A short routine message confirming a hearing date.",
  consent: { textAnalysis: true, voiceAnalysis: true, shareWithCounsellor: true, followUpContact: false },
  steps: [{ kind: "message", text: "Just confirming my hearing date." }],
  expected: { band: "LOW" },
};
const parse = (over: Record<string, unknown>): SimCase => SimCaseSchema.parse({ ...base, ...over });
const speech = (text: string, file: string, take?: string) => ({
  kind: "speech",
  text,
  audio: { file, source: "PLACEHOLDER" },
  ...(take ? { take } : {}),
});
const key = (itemCode: string, digit: string) => ({ kind: "key", itemCode, digit });

describe("the case library on disk (AC-SIM-02)", () => {
  const { cases, errors } = loadSimCases();

  it("loads all twelve cases without errors", () => {
    expect(errors).toEqual([]);
    expect(cases.map((c) => c.id)).toEqual(["C01", "C02", "C03", "C04", "C05", "C06", "C07", "C08", "C09", "C10", "C11", "C12"]);
  });

  it("covers every channel and every band, with no case problems", () => {
    expect(checkLibrary(cases).errors).toEqual([]);
  });

  it("reports outstanding reviews and recordings without failing", () => {
    const { pending } = checkLibrary(cases);
    expect(pending.some((p) => p.includes("second-person review"))).toBe(true);
  });
});

describe("a case file is a script, never a result (FR-SIM-04)", () => {
  it.each([["svi", 72], ["band", "HIGH"], ["indicators", []], ["recommendations", []], ["caste", "x"]])("rejects a %s field", (field, value) => {
    expect(SimCaseSchema.safeParse({ ...base, [field]: value }).success).toBe(false);
  });

  it("rejects a result inside a step", () => {
    expect(SimCaseSchema.safeParse({ ...base, steps: [{ kind: "message", text: "hello", svi: 40 }] }).success).toBe(false);
  });

  it("accepts the base case", () => {
    expect(checkCase(parse({}))).toEqual([]);
  });

  it("rejects a bad id, district code or audio path", () => {
    expect(SimCaseSchema.safeParse({ ...base, id: "C13" }).success).toBe(false);
    expect(SimCaseSchema.safeParse({ ...base, districtCode: "Pune" }).success).toBe(false);
    expect(SimCaseSchema.safeParse({ ...base, steps: [speech("hi", "../secret.ogg")] }).success).toBe(false);
  });
});

describe("case checks", () => {
  it("only allows steps that the channel can carry", () => {
    const errs = checkCase(parse({ channel: "CHATBOT", steps: [speech("hello", "audio/x.ogg")] }));
    expect(errs.join()).toMatch(/speech step cannot come through CHATBOT/);
  });

  it("needs voice consent for speech and text consent for messages", () => {
    const consent = { textAnalysis: false, voiceAnalysis: false, shareWithCounsellor: true, followUpContact: false };
    const errs = checkCase(parse({ consent, steps: [speech("hello", "audio/x.ogg"), { kind: "message", text: "hi" }] }));
    expect(errs.join()).toMatch(/voiceAnalysis consent/);
    expect(errs.join()).toMatch(/textAnalysis consent/);
  });

  it("needs an English gloss for non-English lines", () => {
    expect(checkCase(parse({ language: "hi", steps: [{ kind: "message", text: "नमस्ते" }] })).join()).toMatch(/gloss/);
    expect(checkCase(parse({ language: "hi", steps: [{ kind: "message", text: "नमस्ते", gloss: "Hello" }] }))).toEqual([]);
  });

  it("checks keypad answers against the screener items", () => {
    const ivrs = (steps: unknown[]) => checkCase(parse({ channel: "IVRS", steps })).join();
    expect(ivrs([key("NOT_AN_ITEM", "1")])).toMatch(/unknown screener item/);
    expect(ivrs([key("SAFETY_SAFE_NOW", "3")])).toMatch(/not an answer/);
    expect(ivrs([key("SAFETY_SUICIDAL_INTENT", "1")])).toMatch(/only asked after "yes"/);
    expect(ivrs([key("SAFETY_SAFE_NOW", "1"), key("SAFETY_SAFE_NOW", "2")])).toMatch(/answered twice/);
    expect(ivrs([key("SAFETY_SUICIDAL_THOUGHTS", "1"), key("SAFETY_SUICIDAL_INTENT", "2"), key("PHQ2_1", "3")])).toBe("");
  });

  it("checks the two takes of a different-readings case", () => {
    const takes = [{ id: "calm", label: "Calm" }, { id: "shaking", label: "Shaking" }];
    const expected = { differentReadings: true, note: "Voice should differ." };
    const same = [speech("same words", "audio/a.ogg", "calm"), speech("same words", "audio/b.ogg", "shaking")];
    expect(checkCase(parse({ channel: "VOICE_CALL", takes, expected, steps: same }))).toEqual([]);

    const differ = [speech("calm words", "audio/a.ogg", "calm"), speech("other words", "audio/b.ogg", "shaking")];
    expect(checkCase(parse({ channel: "VOICE_CALL", takes, expected, steps: differ })).join()).toMatch(/exactly the same words/);

    const oneTake = [speech("same words", "audio/a.ogg", "calm")];
    expect(checkCase(parse({ channel: "VOICE_CALL", takes: [takes[0]], expected, steps: oneTake })).join()).toMatch(/at least two takes/);
    expect(checkCase(parse({ channel: "VOICE_CALL", takes, steps: same })).join()).toMatch(/only for a "different readings" case/);
    expect(checkCase(parse({ channel: "VOICE_CALL", steps: [speech("x", "audio/a.ogg"), speech("y", "audio/a.ogg")] })).join()).toMatch(/used twice/);
  });
});

describe("library coverage", () => {
  it("flags a missing channel, band and case id", () => {
    const { errors } = checkLibrary([parse({})]);
    expect(errors).toContain("missing case C01");
    expect(errors).toContain("no case comes through PORTAL");
    expect(errors).toContain("no case is expected to be CRITICAL");
  });
});

describe("helpers", () => {
  it("maps keypad digits like the IVRS menu", () => {
    const yesNo = ITEM_BY_CODE.get("SAFETY_SAFE_NOW")!;
    const scale = ITEM_BY_CODE.get("PHQ2_1")!;
    expect([keyValue(yesNo, "1"), keyValue(yesNo, "2"), keyValue(yesNo, "*"), keyValue(yesNo, "0")]).toEqual([1, 0, null, undefined]);
    expect([keyValue(scale, "0"), keyValue(scale, "3"), keyValue(scale, "*")]).toEqual([0, 3, null]);
  });

  it("sends Hinglish to the module as Hindi", () => {
    expect(apiLanguage("hi-Latn")).toBe("hi");
    expect(apiLanguage("ta")).toBe("ta");
  });
});
