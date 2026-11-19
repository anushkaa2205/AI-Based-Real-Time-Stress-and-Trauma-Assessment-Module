/** Task P.11 (FR-LANG-07, API_CONTRACTS §6.5, §6.8): the conversation follows a language switch. */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { PortalLanguage, PortalLanguageResult } from "@/contracts/portal";
import { INTEGRATION_CONTRACT_VERSION, LanguageRequest, LanguageResponse } from "@/contracts/integration";
import { t } from "@/core/i18n/messages";
import { languageView } from "@/core/integration/language";
import { relabel } from "@/components/portal/relabel";

const q = (name: string) => `operatorQuestions.${name}`;
const src = (p: string) => readFileSync(resolve(__dirname, "../../src", p), "utf8");

describe("PUT …/language view (P.11)", () => {
  it("re-words the scripted questions asked so far, in order, and leaves an operator's own words out", () => {
    const turns = [t("en", q("opening")), "Take your time.", t("en", q("safeNow"))];
    const out = languageView("hi", turns);
    expect(out).toEqual({ language: "hi", asked: [{ key: q("opening"), text: t("hi", q("opening")) }, { key: q("safeNow"), text: t("hi", q("safeNow")) }] });
    expect(LanguageResponse.parse(out)).toEqual(out);
  });

  it("carries exactly language and asked[].key/text; never a score, band or indicator", () => {
    const out = languageView("ta", [t("hi", q("accusedNearby"))]);
    expect(Object.keys(out).sort()).toEqual(["asked", "language"]);
    expect(Object.keys(out.asked[0] ?? {}).sort()).toEqual(["key", "text"]);
    expect(LanguageResponse.safeParse({ ...out, band: "HIGH" }).success).toBe(false);
    expect(LanguageResponse.safeParse({ ...out, asked: [{ ...out.asked[0], reason: "x" }] }).success).toBe(false);
  });

  it("accepts only the five languages", () => {
    expect(LanguageRequest.safeParse({ language: "hi" }).success).toBe(true);
    expect(LanguageRequest.safeParse({ language: "fr" }).success).toBe(false);
    expect(PortalLanguage.safeParse({ language: "bn", sender: "OPERATOR" }).success).toBe(false);
  });

  it("is contract 1.4, behind interactions:write, own interactions only, active only", () => {
    expect(INTEGRATION_CONTRACT_VERSION).toBe("1.4");
    const route = src("app/api/v1/integration/interactions/[id]/language/route.ts");
    expect(route).toMatch(/scope: "interactions:write"/);
    expect(route).toMatch(/loadOwned\(String\(params\.id\), client\.id\)/);
    expect(route).toMatch(/INTERACTION_ENDED/);
  });

  it("is in the OpenAPI document", async () => {
    const { openApiDocument } = await import("@/contracts/openapi");
    const doc = openApiDocument() as { paths: Record<string, { put?: unknown }> };
    expect(JSON.stringify(doc.paths["/api/v1/integration/interactions/{id}/language"]?.put)).toContain("interactions:write");
  });
});

describe("portal relay and page (P.11)", () => {
  it("the public answer is the questions' text only, never their keys", () => {
    expect(PortalLanguageResult.safeParse({ questions: ["क्या आप अभी किसी सुरक्षित जगह पर हैं?"] }).success).toBe(true);
    expect(PortalLanguageResult.safeParse({ questions: [], asked: [] }).success).toBe(false);
    const route = src("app/api/portal/interactions/[id]/language/route.ts");
    expect(route).toMatch(/owned: true/);
    expect(route).not.toMatch(/key:/);
  });

  it("replaces the assistant's lines in order and never the person's words or the closing line", () => {
    const turns = [
      { who: "assistant" as const, text: "Q1 en" },
      { who: "person" as const, text: "my own words" },
      { who: "assistant" as const, text: "Q2 en" },
      { who: "assistant" as const, text: "", closing: true },
    ];
    expect(relabel(turns, ["Q1 hi", "Q2 hi"]).map((x) => x.text)).toEqual(["Q1 hi", "my own words", "Q2 hi", ""]);
    expect(relabel(turns, ["Q1 hi"]).map((x) => x.text)).toEqual(["Q1 hi", "my own words", "Q2 en", ""]); // no counterpart: unchanged
  });
});
