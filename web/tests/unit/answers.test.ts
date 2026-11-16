/**
 * Short answers read with their question (task M.9, FR-NLP-11, AC-NLP-08, gap V7).
 * The module never asks: the questions here are NHAA's chatbot or operator turns. Synthetic text only.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { answerSignals, polarityOf, safetyQuestionOf, withPreviousQuestion } from "@/core/safety-lexicon/answers";
import { conversationSignals } from "@/core/safety-lexicon/conversation";
import { assess } from "@/core/scoring/assess";
import { DEFAULT_CONFIG } from "@/core/scoring/defaultConfig";

const q = (lang: string) => JSON.parse(readFileSync(resolve(__dirname, `../../messages/${lang}.json`), "utf8")).operatorQuestions;
const LANGS = ["en", "hi", "mr", "ta", "bn"] as const;

describe("safetyQuestionOf", () => {
  it.each(LANGS)("recognises the four scripted safety questions in %s", (lang) => {
    const o = q(lang);
    expect(safetyQuestionOf(o.safeNow)).toBe("SAFE_NOW");
    expect(safetyQuestionOf(o.accusedNearby)).toBe("ACCUSED_NEARBY");
    expect(safetyQuestionOf(o.suicidalThoughts)).toBe("SUICIDAL_THOUGHTS");
    expect(safetyQuestionOf(o.suicidalIntent)).toBe("SUICIDAL_INTENT");
  });

  it("recognises other wordings a chatbot or operator might use", () => {
    expect(safetyQuestionOf("Are you safe right now?")).toBe("SAFE_NOW");
    expect(safetyQuestionOf("Do you feel safe at home?")).toBe("SAFE_NOW");
    expect(safetyQuestionOf("Is anyone who hurt you nearby?")).toBe("ACCUSED_NEARBY");
    expect(safetyQuestionOf("Have you thought about killing yourself?")).toBe("SUICIDAL_THOUGHTS");
    expect(safetyQuestionOf("kya aap abhi safe ho?")).toBe("SAFE_NOW");
  });

  it("ignores questions that are not safety questions", () => {
    for (const s of [q("en").whoCanHelp, q("en").sayMore, q("en").injury, "When was the hearing?", "Did you go to the police?"]) {
      expect(safetyQuestionOf(s), s).toBeNull();
    }
  });
});

describe("polarityOf", () => {
  it.each([
    ["No", "NO"],
    ["no.", "NO"],
    ["Nope, not really", "NO"],
    ["Yes", "YES"],
    ["yes, he is outside", "YES"],
    ["हाँ", "YES"],
    ["जी हाँ", "YES"],
    ["नहीं", "NO"],
    ["haan ji", "YES"],
    ["nahi", "NO"],
    ["हो", "YES"],
    ["नाही", "NO"],
    ["ஆம்", "YES"],
    ["இல்லை", "NO"],
    ["হ্যাঁ", "YES"],
    ["না", "NO"],
  ])("%j → %s", (answer, polarity) => {
    expect(polarityOf(answer)?.polarity).toBe(polarity);
  });

  it("ignores long answers and answers that do not start with yes or no", () => {
    expect(polarityOf("No, but last week they came to the gate and shouted at my father and brother")).toBeNull();
    expect(polarityOf("I am at my sister's place")).toBeNull();
    expect(polarityOf("")).toBeNull();
  });
});

describe("answerSignals: the old safety check's meaning, from words", () => {
  const flagsOf = (question: string, answer: string) => answerSignals(question, answer).indicators.flatMap((i) => i.flags ?? []);

  it("'No' to 'are you safe' → NOT_SAFE_NOW (OV-9)", () => {
    expect(flagsOf(q("en").safeNow, "No")).toEqual(["NOT_SAFE_NOW"]);
    expect(answerSignals(q("en").safeNow, "No").facts).toEqual(["NOT_SAFE_NOW"]);
  });
  it("'Yes' to 'accused near you' → ACCUSED_PRESENT (OV-2)", () => {
    expect(flagsOf(q("hi").accusedNearby, "हाँ")).toEqual(["ACCUSED_PRESENT"]);
  });
  it("'Yes' to suicidal thoughts → PASSIVE_SUICIDAL_IDEATION (OV-6); to intent → SUICIDAL_INTENT (OV-1)", () => {
    expect(flagsOf(q("ta").suicidalThoughts, "ஆம்")).toEqual(["PASSIVE_SUICIDAL_IDEATION"]);
    expect(flagsOf(q("bn").suicidalIntent, "হ্যাঁ")).toEqual(["SUICIDAL_INTENT"]);
  });
  it("the reassuring answer adds nothing (no denial scores in config v3)", () => {
    expect(answerSignals(q("en").safeNow, "Yes").indicators).toEqual([]);
    expect(answerSignals(q("en").accusedNearby, "No").indicators).toEqual([]);
    expect(answerSignals(q("en").suicidalThoughts, "No").indicators).toEqual([]);
  });
  it("the same 'No' after an unrelated question adds nothing (AC-NLP-08)", () => {
    expect(answerSignals("Did you go to the police station?", "No").indicators).toEqual([]);
    expect(answerSignals(null, "No").indicators).toEqual([]);
  });
  it("the evidence quote is the person's own word, as written (rule 12)", () => {
    const answer = "  No, I am not";
    const [ind] = answerSignals(q("en").safeNow, answer).indicators;
    expect(answer.slice(ind!.evidence.start, ind!.evidence.end)).toBe(ind!.evidence.quote);
    expect(ind!.evidence.quote).toBe("No");
    expect(ind!.source).toBe("SAFETY_LEXICON");
  });
});

describe("conversationSignals and AC-NLP-08 end to end (rules only)", () => {
  const band = (turns: { sender: "VICTIM" | "OPERATOR"; text: string }[]) =>
    assess({ indicators: conversationSignals(turns).flatMap((t) => t.indicators), config: DEFAULT_CONFIG, limitedConfidence: true });

  it("'No' after 'Are you safe right now?' raises the band to at least High", () => {
    const d = band([
      { sender: "OPERATOR", text: "Are you safe right now?" },
      { sender: "VICTIM", text: "No" },
    ]);
    expect(d.overridesFired).toContain("OV-9");
    expect(["HIGH", "CRITICAL"]).toContain(d.band);
  });

  it("the same 'No' after an unrelated question does not", () => {
    const d = band([
      { sender: "OPERATOR", text: "Did you get the copy of your complaint?" },
      { sender: "VICTIM", text: "No" },
    ]);
    expect(d.overridesFired).toEqual([]);
    expect(d.band).toBe("LOW");
  });

  it("a question is only answered by the very next turn of the person", () => {
    const pairs = withPreviousQuestion([
      { sender: "OPERATOR", text: "Are you safe right now?" },
      { sender: "VICTIM", text: "I am at home." },
      { sender: "VICTIM", text: "No" },
    ]);
    expect(pairs.map((p) => p.question)).toEqual(["Are you safe right now?", null]);
  });

  it("the operator's own words are never scored", () => {
    const d = band([{ sender: "OPERATOR", text: "Are you having thoughts of ending your life?" }]);
    expect(d.svi).toBe(0);
    expect(d.overridesFired).toEqual([]);
  });
});
