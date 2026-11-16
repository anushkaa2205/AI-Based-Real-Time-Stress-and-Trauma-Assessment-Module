/**
 * Speaker-separation safety net (task M.10, FR-VOI-10, CLAUDE.md rule 4, NFR-ETH-05).
 * Synthetic, non-graphic text only.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { operatorTextNeedsScoring } from "@/core/safety-lexicon/speaker-check";

const LANGS = ["en", "hi", "mr", "ta", "bn"] as const;
const questions = (lang: string): Record<string, string> =>
  JSON.parse(readFileSync(resolve(__dirname, `../../messages/${lang}.json`), "utf8")).operatorQuestions;

describe("operatorTextNeedsScoring", () => {
  it.each(LANGS)("no scripted operator question in %s triggers it (questions are never scored)", (lang) => {
    for (const [key, text] of Object.entries(questions(lang))) expect(operatorTextNeedsScoring(text), `${lang} ${key}`).toBe(false);
  });

  it("ordinary operator talk does not trigger it", () => {
    for (const t of ["National helpline against atrocities. How can I help you today?", "I understand. Is there anything else?", ""]) {
      expect(operatorTextNeedsScoring(t), t).toBe(false);
    }
  });

  it.each([
    "I want to die",
    "They are standing outside my house right now.",
    "I am not safe here",
    "वो लोग अभी घर के बाहर खड़े हैं",
  ])("a first-person life-safety statement labelled as the operator's is scored as the caller's: %j", (text) => {
    expect(operatorTextNeedsScoring(text)).toBe(true);
  });

  it("a negated statement does not trigger it", () => {
    expect(operatorTextNeedsScoring("I would never hurt myself")).toBe(false);
  });
});

describe("questions never count, statements do", () => {
  it.each(["क्या आपको चोट लगी है?", "kya aapko chot lagi hai", "Are they standing outside your house right now?", "Is he outside my house right now?"])(
    "question %j → false",
    (text) => {
      expect(operatorTextNeedsScoring(text)).toBe(false);
    },
  );
  it("a statement after a question in the same transcript still counts", () => {
    expect(operatorTextNeedsScoring("Are you safe? They are standing outside my house right now.")).toBe(true);
  });
});
