/** Victim flow, consent and contracts (tasks 3.1, 3.3, 3.4, 3.8). Pure; no database. */
import { describe, expect, it } from "vitest";
import {
  ConsentNotice,
  FORBIDDEN_VICTIM_FIELDS,
  MessageRequest,
  MessageResponse,
  StartResponse,
  TurnResponse,
  VICTIM_LANGS,
} from "@/contracts/victim";
import { formatDocket, DOCKET_PATTERN } from "@/core/cases/docket";
import { allowsScreeners, allowsTextAnalysis, currentConsent, resolveMode } from "@/core/consent/mode";
import { INITIAL_FLOW, MAX_NARRATIVE_TURNS, flowStateOf, nextStep, promptFor, type FlowFacts } from "@/core/conversation/flow";
import { MESSAGES, hasKey, leafKeys, t } from "@/core/i18n/messages";
import { ITEMS } from "@/core/screeners/items";
import { emergencyPanel, shouldShowEmergency } from "@/core/victim/emergency";
import { consentNotice } from "@/core/victim/service";
import { hashSessionToken, newSessionToken } from "@/core/victim/session";

const facts = (over: Partial<FlowFacts> = {}, answered: Record<string, number | null> = {}): FlowFacts => ({
  consentGiven: true,
  mode: "FULL",
  answered: new Map(Object.entries(answered)),
  state: { ...INITIAL_FLOW },
  ...over,
});
const allSafety = { SAFETY_SAFE_NOW: 1, SAFETY_ACCUSED_NEARBY: 0, SAFETY_SUICIDAL_THOUGHTS: 0 };
const key = (f: FlowFacts) => {
  const s = nextStep(f);
  return s.kind === "SCREENER" ? s.item.itemCode : s.kind;
};

describe("consent → mode (task 3.3, FR-CON-02/03/05)", () => {
  it.each([
    [true, true, "FULL"],
    [true, false, "TEXT_ONLY"],
    [false, true, "VOICE_ONLY"],
    [false, false, "SAFETY_ONLY"],
  ] as const)("text=%s voice=%s → %s", (text, voice, mode) => {
    expect(resolveMode({ textAnalysis: text, voiceAnalysis: voice }, { isMinor: false })).toBe(mode);
  });

  it("no consent means safety check only", () => {
    expect(resolveMode(null, { isMinor: false })).toBe("SAFETY_ONLY");
  });

  it("a minor without a guardian's consent gets safety check only", () => {
    expect(resolveMode({ textAnalysis: true, voiceAnalysis: true }, { isMinor: true })).toBe("SAFETY_ONLY");
    expect(resolveMode({ textAnalysis: true, voiceAnalysis: true, guardianConsent: true }, { isMinor: true })).toBe("FULL");
  });

  it("a withdrawal cancels earlier consent (FR-CON-04)", () => {
    const entries = [
      { action: "GRANTED" as const, textAnalysis: true, voiceAnalysis: true },
      { action: "WITHDRAWN" as const, textAnalysis: false, voiceAnalysis: false },
    ];
    expect(currentConsent(entries)).toBeNull();
    expect(currentConsent(entries.slice(0, 1))).toEqual(entries[0]);
  });

  it("only text consent allows text analysis; screeners need some analysis consent", () => {
    expect(allowsTextAnalysis("VOICE_ONLY")).toBe(false);
    expect(allowsTextAnalysis("TEXT_ONLY")).toBe(true);
    expect(allowsScreeners("SAFETY_ONLY")).toBe(false);
    expect(allowsScreeners("VOICE_ONLY")).toBe(true);
  });
});

describe("conversation flow (task 3.4)", () => {
  it("asks for consent first", () => {
    expect(key(facts({ consentGiven: false }))).toBe("CONSENT");
  });

  it("runs the safety check first, in every mode, even with all consent declined (FR-SCR-01, AC-SCR-01)", () => {
    for (const mode of ["SAFETY_ONLY", "TEXT_ONLY", "VOICE_ONLY", "FULL"] as const) {
      expect(key(facts({ mode }))).toBe("SAFETY_SAFE_NOW");
    }
  });

  it("asks about intent only after a 'yes' to suicidal thoughts", () => {
    expect(key(facts({}, { SAFETY_SAFE_NOW: 1, SAFETY_ACCUSED_NEARBY: 0, SAFETY_SUICIDAL_THOUGHTS: 1 }))).toBe("SAFETY_SUICIDAL_INTENT");
    expect(key(facts({}, allSafety))).toBe("CONTEXT");
  });

  it("treats a skipped question as answered, so the flow always completes (FR-CH-09, AC-CH-05)", () => {
    const skippedAll = { SAFETY_SAFE_NOW: null, SAFETY_ACCUSED_NEARBY: null, SAFETY_SUICIDAL_THOUGHTS: null };
    expect(key(facts({}, skippedAll))).toBe("CONTEXT");
  });

  it("then context, then the narrative (asked once, then 'anything else?')", () => {
    const f = facts({ state: { ...INITIAL_FLOW, contextDone: true } }, allSafety);
    expect(nextStep(f)).toEqual({ kind: "NARRATIVE", followUp: false });
    expect(nextStep({ ...f, state: { ...f.state, narrativeTurns: 1 } })).toEqual({ kind: "NARRATIVE", followUp: true });
  });

  it("stops the narrative after it is skipped or after the maximum turns", () => {
    const base = { ...INITIAL_FLOW, contextDone: true };
    expect(key(facts({ state: { ...base, narrativeDone: true } }, allSafety))).toBe("PHQ2_1");
    expect(key(facts({ state: { ...base, narrativeTurns: MAX_NARRATIVE_TURNS } }, allSafety))).toBe("PHQ2_1");
  });

  it("offers the suicide-risk screen only after a sign of suicidal thoughts", () => {
    const state = { ...INITIAL_FLOW, contextDone: true, narrativeDone: true };
    expect(key(facts({ state }, allSafety))).toBe("PHQ2_1");
    expect(key(facts({ state: { ...state, suicideSignal: true } }, allSafety))).toBe("CSSRS_1");
  });

  it("skips all screeners after the safety check when there is no analysis consent (AC-CON-03)", () => {
    const state = { ...INITIAL_FLOW, contextDone: true, narrativeDone: true };
    expect(key(facts({ mode: "SAFETY_ONLY", state }, allSafety))).toBe("CLOSE");
  });

  it("closes after every screener is answered", () => {
    const state = { ...INITIAL_FLOW, contextDone: true, narrativeDone: true };
    const answered = Object.fromEntries(ITEMS.filter((i) => !i.itemCode.startsWith("CSSRS")).map((i) => [i.itemCode, 0]));
    expect(key(facts({ state }, answered))).toBe("CLOSE");
    expect(key(facts({ state: { ...state, closed: true } }))).toBe("CLOSE");
  });

  it("reads a stored flow state defensively", () => {
    expect(flowStateOf(undefined)).toEqual(INITIAL_FLOW);
    expect(flowStateOf({ narrativeTurns: "x", closed: true })).toMatchObject({ narrativeTurns: 0, closed: true });
  });

  it("every prompt is scripted text from messages/*.json in both languages (CLAUDE.md rule 2)", () => {
    const steps = [
      { kind: "CONSENT" as const },
      { kind: "CONTEXT" as const },
      { kind: "NARRATIVE" as const, followUp: false },
      { kind: "NARRATIVE" as const, followUp: true },
      { kind: "CLOSE" as const },
      ...ITEMS.map((item) => ({ kind: "SCREENER" as const, item })),
    ];
    for (const lang of VICTIM_LANGS) {
      for (const s of steps) {
        const p = promptFor(s, lang);
        expect(hasKey(lang, p.key), `${lang}:${p.key}`).toBe(true);
        expect(p.text).toBe(t(lang, p.key));
        expect(p.text).not.toMatch(/\{|\}|flow\./);
      }
    }
  });

  it("every question except the closing note can be skipped", () => {
    expect(ITEMS.every((item) => promptFor({ kind: "SCREENER", item }, "en").skippable)).toBe(true);
    expect(promptFor({ kind: "NARRATIVE", followUp: false }, "hi").skippable).toBe(true);
  });
});

describe("i18n (task 3.8, AC-LANG-01)", () => {
  it("every key exists in every language", () => {
    const en = new Set(leafKeys(MESSAGES.en));
    for (const lang of VICTIM_LANGS) expect(new Set(leafKeys(MESSAGES[lang]))).toEqual(en);
  });

  it("victim text uses no diagnostic labels (NFR-ETH-02, AC-ETH-01)", () => {
    const words = /\b(diagnos\w*|disorder|PTSD|depression|you have (depression|anxiety|trauma)|risk score|SVI)\b/i;
    for (const k of leafKeys(MESSAGES.en)) expect(t("en", k), k).not.toMatch(words);
    for (const k of leafKeys(MESSAGES.hi)) expect(t("hi", k), k).not.toMatch(/अवसाद|विकार|निदान|SVI/);
  });
});

describe("victim responses never carry scores (CLAUDE.md rule 1)", () => {
  const prompt = promptFor({ kind: "NARRATIVE", followUp: false }, "en");

  it("strict contracts reject any extra field", () => {
    for (const field of FORBIDDEN_VICTIM_FIELDS) {
      expect(TurnResponse.safeParse({ next: prompt, showEmergencyPanel: false, emergency: null, [field]: 1 }).success, field).toBe(false);
      expect(
        MessageResponse.safeParse({ messageId: null, reply: prompt, showEmergencyPanel: true, emergency: null, [field]: "x" }).success,
        field,
      ).toBe(false);
    }
    expect(TurnResponse.safeParse({ next: { ...prompt, band: "HIGH" }, showEmergencyPanel: false, emergency: null }).success).toBe(false);
  });

  it("accepts the normal shapes", () => {
    expect(TurnResponse.parse({ next: prompt, showEmergencyPanel: true, emergency: emergencyPanel("hi") })).toBeTruthy();
    expect(ConsentNotice.parse(consentNotice("hi")).body).toHaveLength(6);
    expect(
      StartResponse.safeParse({
        interactionId: "0123456789abcdef01234567",
        docketNumber: "NHAA-2026-MH-000123",
        consentNotice: consentNotice("en"),
        aiDisclosure: "x",
        quickExitUrl: "https://www.google.com",
      }).success,
    ).toBe(true);
  });

  it("the only risk signal is the emergency panel, shown for Critical only", () => {
    expect(shouldShowEmergency("CRITICAL")).toBe(true);
    for (const b of ["LOW", "MODERATE", "HIGH", null, undefined] as const) expect(shouldShowEmergency(b)).toBe(false);
    const panel = emergencyPanel("en");
    expect(panel.numbers.map((n) => n.number)).toEqual(["112", "14416", "14566"]);
    expect(JSON.stringify(panel)).not.toMatch(/critical|band|svi|score/i);
  });

  it("message requests need text unless skipped", () => {
    expect(MessageRequest.safeParse({ text: "" }).success).toBe(false);
    expect(MessageRequest.safeParse({ skipped: true }).success).toBe(true);
    expect(MessageRequest.safeParse({ text: "hello" }).success).toBe(true);
  });
});

describe("docket and session token (task 3.2, FR-CH-07)", () => {
  it("formats docket numbers", () => {
    expect(formatDocket(2026, "MH", 4512)).toBe("NHAA-2026-MH-004512");
    expect(formatDocket(2026, "bad", 1)).toBe("NHAA-2026-XX-000001");
    expect(DOCKET_PATTERN.test(formatDocket(2026, "TN", 999_999))).toBe(true);
  });

  it("makes 256-bit tokens and stores only their hash", () => {
    const token = newSessionToken();
    expect(Buffer.from(token, "base64url")).toHaveLength(32);
    expect(hashSessionToken(token)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashSessionToken(token)).not.toContain(token);
    expect(newSessionToken()).not.toBe(token);
  });
});
