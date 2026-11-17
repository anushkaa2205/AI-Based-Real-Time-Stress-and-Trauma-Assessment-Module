/** Task P.3 (FR-API-07, AC-API-03, API_CONTRACTS §6.7): the next scripted question for a calling system's chatbot. */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { NextQuestionResponse } from "@/contracts/integration";
import { VICTIM_LANGS } from "@/contracts/interaction";
import { hasKey, t } from "@/core/i18n/messages";
import { SCOPES } from "@/core/integration/apikey";
import { nextQuestionView } from "@/core/integration/next-question";
import { askedKeys } from "@/core/operator/asked";
import { MAX_CHATBOT_QUESTIONS, OPENING_KEY, nextChatbotQuestion, suggestQuestions, type NextQuestionInput } from "@/core/operator/suggest";

const q = (name: string) => `operatorQuestions.${name}`;
const base: NextQuestionInput = { dimensions: {}, suicideSignal: false, notSafeNow: false, asked: [], turns: 0 };

describe("nextChatbotQuestion (P.3)", () => {
  it("opens with the scripted opening when nothing has been said yet", () => {
    expect(nextChatbotQuestion(base)).toBe(OPENING_KEY);
    for (const lang of VICTIM_LANGS) expect(hasKey(lang, OPENING_KEY), lang).toBe(true);
  });

  it("asks safety first, then never repeats a question already asked", () => {
    expect(nextChatbotQuestion({ ...base, turns: 2, asked: [OPENING_KEY] })).toBe(q("safeNow"));
    expect(nextChatbotQuestion({ ...base, turns: 4, asked: [OPENING_KEY, q("safeNow")] })).toBe(q("accusedNearby"));
    expect(nextChatbotQuestion({ ...base, turns: 6, asked: [OPENING_KEY, q("safeNow"), q("accusedNearby")] })).toBe(q("sayMore"));
  });

  it("asks for a safe place after the person said they are not safe now (OV-9)", () => {
    expect(nextChatbotQuestion({ ...base, turns: 4, notSafeNow: true, asked: [OPENING_KEY, q("safeNow")] })).toBe(q("safePlace"));
  });

  it("asks the suicide questions on any sign, before anything else but safety", () => {
    const input = { ...base, turns: 4, suicideSignal: true, dimensions: { SUICIDAL_IDEATION: 0.6 }, asked: [OPENING_KEY, q("safeNow")] };
    expect(nextChatbotQuestion(input)).toBe(q("suicidalThoughts"));
    expect(nextChatbotQuestion({ ...input, asked: [...input.asked, q("suicidalThoughts")] })).toBe(q("suicidalIntent"));
  });

  it("stops after six scripted questions, and when nothing is left", () => {
    const six = [OPENING_KEY, q("safeNow"), q("accusedNearby"), q("nervous"), q("lowInterest"), q("badDreams")];
    expect(six).toHaveLength(MAX_CHATBOT_QUESTIONS);
    expect(nextChatbotQuestion({ ...base, turns: 12, dimensions: { INTIMIDATION: 0.9 }, asked: six })).toBeNull();
    expect(nextChatbotQuestion({ ...base, turns: 8, asked: [OPENING_KEY, q("safeNow"), q("accusedNearby"), q("sayMore")] })).toBeNull();
  });

  it("the operator console skips asked questions too", () => {
    expect(suggestQuestions({ ...base, asked: [q("safeNow")] }).map((s) => s.key)).toEqual([q("accusedNearby"), q("sayMore")]);
  });
});

describe("askedKeys (P.3)", () => {
  it("finds a scripted question in an OPERATOR turn, ignoring spacing and case, in the interaction's language", () => {
    const hi = t("hi", q("safeNow"));
    expect(askedKeys("hi", [`  ${hi.toUpperCase()}  `, "कुछ और"])).toEqual([q("safeNow")]);
    expect(askedKeys("en", [t("en", OPENING_KEY), "Can you tell me more about that?"])).toEqual([OPENING_KEY]);
    expect(askedKeys("en", [hi])).toEqual([]); // another language's wording is not this interaction's question
  });
});

describe("next-question response (P.3)", () => {
  it("carries exactly question.key and question.text, or null; never a reason, dimension or score", () => {
    const out = nextQuestionView("en", q("safeNow"));
    expect(Object.keys(out)).toEqual(["question"]);
    expect(Object.keys(out.question ?? {}).sort()).toEqual(["key", "text"]);
    expect(out.question?.text).toBe(t("en", q("safeNow")));
    expect(NextQuestionResponse.parse(out)).toEqual(out);
    expect(NextQuestionResponse.safeParse({ question: { ...out.question, reason: "Check safety first" } }).success).toBe(false);
    expect(nextQuestionView("ta", null)).toEqual({ question: null });
  });

  it("sits behind the questions:read scope and the client's own interactions only", () => {
    expect(SCOPES).toContain("questions:read");
    const src = readFileSync(resolve(__dirname, "../../src/app/api/v1/integration/interactions/[id]/next-question/route.ts"), "utf8");
    expect(src).toMatch(/scope: "questions:read"/);
    expect(src).toMatch(/loadOwned\(String\(params\.id\), client\.id\)/); // another client's interaction → 404
  });

  it("is in the OpenAPI document behind questions:read, returning only `question`", async () => {
    const { openApiDocument } = await import("@/contracts/openapi");
    const doc = openApiDocument() as { paths: Record<string, { get?: { responses: Record<string, { content?: Record<string, { schema: { properties?: Record<string, unknown> } }> }> } }> };
    const op = doc.paths["/api/v1/integration/interactions/{id}/next-question"]?.get;
    expect(op).toBeTruthy();
    expect(JSON.stringify(op)).toContain("questions:read");
    expect(Object.keys(op!.responses["200"]?.content?.["application/json"]?.schema.properties ?? {})).toEqual(["question"]);
  });
});
