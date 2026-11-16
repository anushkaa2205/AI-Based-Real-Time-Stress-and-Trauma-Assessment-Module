/**
 * Short answers read with their question (task M.9, FR-NLP-11, AC-NLP-08, gap V7).
 * The module never asks: the questions here are NHAA's chatbot or operator turns. Synthetic text only.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { answerSignals, frequencyOf, polarityOf, safetyQuestionOf, wellbeingQuestionOf, withPreviousQuestion } from "@/core/safety-lexicon/answers";
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

describe("wellbeing questions asked in the conversation (M.9, decided 16 Nov 2026, AC-NLP-09)", () => {
  const SAFETY_KEYS = { safeNow: "SAFE_NOW", accusedNearby: "ACCUSED_NEARBY", suicidalThoughts: "SUICIDAL_THOUGHTS", suicidalIntent: "SUICIDAL_INTENT" } as const;
  const WELLBEING_KEYS = ["lowInterest", "feelingDown", "nervous", "cannotStopWorrying", "badDreams", "avoidance", "onGuard", "numb", "guilt"] as const;

  it.each(LANGS)("every scripted question in %s is recognised as itself and never as another", (lang) => {
    const o = q(lang);
    for (const [key, kind] of Object.entries(SAFETY_KEYS)) {
      expect(safetyQuestionOf(o[key]), `${lang} ${key}`).toBe(kind);
      expect(wellbeingQuestionOf(o[key]), `${lang} ${key}`).toBeNull();
    }
    for (const key of WELLBEING_KEYS) {
      expect(wellbeingQuestionOf(o[key]), `${lang} ${key}`).toBe(key);
      expect(safetyQuestionOf(o[key]), `${lang} ${key}`).toBeNull();
    }
  });

  it("a 'yes' to the Hindi 'cut off from your surroundings' item is trauma, not 'accused nearby'", () => {
    const s = answerSignals(q("hi").numb, "हाँ");
    expect(s.indicators.map((i) => i.dimension)).toEqual(["SEVERE_TRAUMA"]);
    expect(s.indicators.flatMap((i) => i.flags ?? [])).toEqual([]);
  });

  it.each([
    ["Not at all", null],
    ["Several days", 1],
    ["More than half the days", 2],
    ["nearly every day", 3],
    ["आधे से ज़्यादा दिन", 2],
    ["kuch din", 1],
    ["अर्ध्याहून जास्त दिवस", 2],
    ["பாதி நாட்களுக்கு மேல்", 2],
    ["প্রায় প্রতিদিন", 3],
  ])("frequency %j → %s", (answer, value) => {
    const f = frequencyOf(answer);
    expect(f ? (f.value === 0 ? null : f.value) : null).toBe(value);
  });

  it("scores each low-mood and anxiety item as frequency / 3, and a trauma 'yes' as 0.6", () => {
    const one = (question: string, answer: string) => answerSignals(question, answer).indicators;
    expect(one(q("en").nervous, "More than half the days")).toMatchObject([{ dimension: "FEAR_ANXIETY", score: 0.67, source: "SAFETY_LEXICON" }]);
    expect(one(q("en").feelingDown, "Nearly every day")).toMatchObject([{ dimension: "DEPRESSION", score: 1 }]);
    expect(one(q("en").lowInterest, "Several days")).toMatchObject([{ dimension: "DEPRESSION", score: 0.33 }]);
    expect(one(q("ta").badDreams, "ஆம்")).toMatchObject([{ dimension: "SEVERE_TRAUMA", score: 0.6 }]);
  });

  it("'not at all', 'no', a long answer or an unrelated question adds nothing", () => {
    expect(answerSignals(q("en").nervous, "Not at all").indicators).toEqual([]);
    expect(answerSignals(q("en").guilt, "No").indicators).toEqual([]);
    expect(answerSignals(q("en").nervous, "More than half the days but only because the hearing keeps getting postponed again and again").indicators).toEqual([]);
    expect(answerSignals("When is your next hearing?", "More than half the days").indicators).toEqual([]);
  });

  it("wellbeing answers never fire a safety override", () => {
    for (const key of WELLBEING_KEYS) {
      for (const answer of ["Yes", "Nearly every day"]) {
        expect(answerSignals(q("en")[key], answer).indicators.flatMap((i) => i.flags ?? []), key).toEqual([]);
      }
    }
  });

  it("AC-NLP-09: 'More than half the days' after the anxiety question gives fear/anxiety ≥ 0.5", () => {
    const d = assess({
      indicators: conversationSignals([
        { sender: "OPERATOR", text: q("en").nervous },
        { sender: "VICTIM", text: "More than half the days" },
      ]).flatMap((t) => t.indicators),
      config: DEFAULT_CONFIG,
      limitedConfidence: true,
    });
    expect(d.dimensions.FEAR_ANXIETY.score).toBeGreaterThanOrEqual(0.5);
    expect(d.overridesFired).toEqual([]);
  });

  it("the evidence quote is the person's own words (rule 12)", () => {
    for (const [question, answer] of [
      [q("hi").nervous, "आधे से ज़्यादा दिन"],
      [q("en").nervous, "  More than half the days."],
      [q("bn").badDreams, "হ্যাঁ"],
    ] as const) {
      const [ind] = answerSignals(question, answer).indicators;
      expect(answer.slice(ind!.evidence.start, ind!.evidence.end)).toBe(ind!.evidence.quote);
    }
  });
});
