"use client";

/**
 * IVRS simulation (task 7.8, FR-CH-05, AC-CH-03): a keypad menu with spoken prompts for
 * low-literacy and basic-phone users. Language choice, consent, the safety check and
 * PHQ-2 / GAD-2 are all answered with keys only (on-screen keypad or the keyboard).
 * It uses the same victim API as the chat; nothing about risk is shown or spoken except
 * the emergency panel (CLAUDE.md rule 1). All wording is scripted (rule 2).
 */
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import type { EmergencyPanel as Panel, VictimLang } from "@/contracts/victim";
import { LANGUAGE_INFO } from "@/i18n/languages";
import { api } from "./api";
import { EmergencyPanel } from "./emergency-panel";

type Lang = VictimLang;
/** Key → language, in the order the welcome prompt reads them out. */
const KEY_LANG: Record<string, Lang> = { "1": "en", "2": "hi", "3": "mr", "4": "ta", "5": "bn" };
type Step =
  | { kind: "language" }
  | { kind: "consent" }
  | { kind: "item"; code: string; scale: "YES_NO" | "SCALE_0_3" }
  | { kind: "done"; docket: string }
  | { kind: "error" };

const SAFETY = ["SAFETY_SAFE_NOW", "SAFETY_ACCUSED_NEARBY", "SAFETY_SUICIDAL_THOUGHTS"];
const SCALES = ["PHQ2_1", "PHQ2_2", "GAD2_1", "GAD2_2"];
const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"];

function instrumentOf(code: string) {
  return code.startsWith("SAFETY_") ? "SAFETY_CHECK" : code.startsWith("PHQ2") ? "PHQ2" : "GAD2";
}

/** What comes after `code`, given the answers so far. The intent question follows "thoughts" (AC-SCR-03). */
function nextItem(code: string | null, answers: Map<string, number | null>, analysis: boolean): Step | null {
  const order = [...SAFETY, ...(answers.get("SAFETY_SUICIDAL_THOUGHTS") === 1 ? ["SAFETY_SUICIDAL_INTENT"] : []), ...(analysis ? SCALES : [])];
  const next = order[code === null ? 0 : order.indexOf(code) + 1];
  if (!next) return null;
  return { kind: "item", code: next, scale: next.startsWith("SAFETY_") ? "YES_NO" : "SCALE_0_3" };
}

export function IvrsScreen({ initialLang }: { initialLang: Lang }) {
  const [lang, setLang] = useState<Lang>(initialLang);
  const t = useTranslations();
  const [step, setStep] = useState<Step>({ kind: "language" });
  const [id, setId] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState(false);
  const [answers] = useState(() => new Map<string, number | null>());
  const [panel, setPanel] = useState<Panel | null>(null);
  const [last, setLast] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const busy = useRef(false);

  // Prompt text in the CHOSEN language (the page locale may differ until the language is picked).
  const [strings, setStrings] = useState<Record<string, string>>({});
  useEffect(() => {
    let live = true;
    import(`../../../messages/${lang}.json`).then((m: { default: Record<string, Record<string, unknown>> }) => {
      if (!live) return;
      const d = m.default;
      const flow = d.flow as { screener: Record<string, string>; scalePrompt: string; safety: { intro: string } };
      const ivrs = d.ivrs as Record<string, string>;
      const s: Record<string, string> = { scalePrompt: flow.scalePrompt, safetyIntro: flow.safety.intro };
      for (const [k, v] of Object.entries(flow.screener)) s[`q.${k}`] = v;
      for (const [k, v] of Object.entries(ivrs)) s[`ivrs.${k}`] = v;
      setStrings(s);
    });
    return () => {
      live = false;
    };
  }, [lang]);

  const promptText = useCallback(
    (st: Step): string => {
      const g = (k: string) => strings[k] ?? "";
      switch (st.kind) {
        case "language":
          return t("ivrs.welcome");
        case "consent":
          return `${g("ivrs.consent")} ${g("ivrs.repeat")}`;
        case "item":
          return st.scale === "YES_NO"
            ? `${st.code === "SAFETY_SAFE_NOW" ? g("safetyIntro") + " " : ""}${g(`q.${st.code}`)} ${g("ivrs.yesNo")}`
            : `${g("scalePrompt")} ${g(`q.${st.code}`)}. ${g("ivrs.scale")}`;
        case "done":
          return `${g("ivrs.done")} ${st.docket.split("").join(" ")}`;
        default:
          return t("common.errorRetry");
      }
    },
    [strings, t],
  );

  const speak = useCallback(
    (text: string) => {
      if (typeof window === "undefined" || !("speechSynthesis" in window) || !text) return;
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = LANGUAGE_INFO[lang].speech;
      u.rate = 0.95;
      window.speechSynthesis.speak(u);
    },
    [lang],
  );

  const text = promptText(step);
  useEffect(() => {
    speak(text);
  }, [text, speak]);
  useEffect(() => () => window.speechSynthesis?.cancel(), []);

  async function finish(interactionId: string) {
    const r = await api<{ docketNumber: string }>("POST", `/interactions/${interactionId}/end`, { reason: "COMPLETED" });
    setStep({ kind: "done", docket: r.docketNumber });
  }

  async function press(key: string) {
    if (busy.current) return;
    setLast(key);
    setNote(null);
    if (key === "9" && step.kind !== "item") {
      speak(text);
      return;
    }
    busy.current = true;
    try {
      if (step.kind === "language") {
        const chosen = KEY_LANG[key];
        if (!chosen) return setNote("invalid");
        setLang(chosen);
        const r = await api<{ interactionId: string }>("POST", "/interactions", { channel: "IVRS", language: chosen });
        setId(r.interactionId);
        setStep({ kind: "consent" });
        return;
      }
      if (!id) return;
      if (step.kind === "consent") {
        if (key !== "1" && key !== "2") return setNote("invalid");
        const yes = key === "1";
        // Keypad answers are analysed only with consent; the safety check runs either way (rule 6).
        await api("POST", `/interactions/${id}/consent`, {
          noticeVersion: "2026-11-v1",
          language: lang,
          textAnalysis: yes,
          voiceAnalysis: false,
          shareWithCounsellor: yes,
          followUpContact: false,
        });
        setAnalysis(yes);
        setStep(nextItem(null, answers, yes)!);
        return;
      }
      if (step.kind === "item") {
        let value: number | null;
        if (key === "*") value = null;
        else if (step.scale === "YES_NO" && (key === "1" || key === "2")) value = key === "1" ? 1 : 0;
        else if (step.scale === "SCALE_0_3" && ["0", "1", "2", "3"].includes(key)) value = Number(key);
        else if (key === "9") {
          speak(text);
          return;
        } else return setNote("invalid");
        const r = await api<{ showEmergencyPanel: boolean; emergency: Panel | null }>("POST", `/interactions/${id}/screeners`, {
          instrument: instrumentOf(step.code),
          itemCode: step.code,
          value,
          skipped: value === null,
        });
        answers.set(step.code, value);
        if (r.showEmergencyPanel && r.emergency) setPanel(r.emergency);
        const next = nextItem(step.code, answers, analysis);
        if (next) setStep(next);
        else await finish(id);
      }
    } catch {
      setStep({ kind: "error" });
    } finally {
      busy.current = false;
    }
  }

  // Physical keyboard digits work too.
  const pressRef = useRef(press);
  useEffect(() => {
    pressRef.current = press;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (KEYS.includes(e.key)) {
        e.preventDefault();
        void pressRef.current(e.key);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <section
      className="flex flex-col gap-5"
      data-testid="ivrs"
      data-step={step.kind === "item" ? step.code : step.kind}
      data-ready={Object.keys(strings).length > 0}
    >
      <h1 className="text-[1.75rem] font-bold leading-tight">{strings["ivrs.title"] ?? t("ivrs.title")}</h1>
      {panel && id && <EmergencyPanel panel={panel} interactionId={id} />}
      <p aria-live="polite" className="card card-pad text-xl" data-testid="ivrs-prompt">
        {text}
      </p>
      {step.kind === "done" && (
        <p className="font-mono text-[1.75rem] font-bold tracking-wider text-navy" data-testid="docket">
          {step.docket}
        </p>
      )}
      {note && (
        <p role="alert" className="border-l-4 border-danger bg-danger-soft px-3 py-2 text-danger">
          {strings["ivrs.invalid"] ?? t("ivrs.invalid")}
        </p>
      )}
      {step.kind !== "done" && step.kind !== "error" && (
        <div role="group" aria-label={strings["ivrs.keypad"] ?? t("ivrs.keypad")} className="mx-auto grid w-full max-w-xs grid-cols-3 gap-2">
          {KEYS.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => press(k)}
              className="flex h-16 items-center justify-center rounded-[4px] border border-input bg-white font-mono text-[1.75rem] font-semibold text-ink shadow-[inset_0_-2px_0_var(--line)] hover:bg-muted active:bg-navy active:text-white"
              data-testid={`key-${k === "*" ? "star" : k === "#" ? "hash" : k}`}
            >
              {k}
            </button>
          ))}
        </div>
      )}
      {last && (
        <p className="text-center text-base text-ink-2" aria-live="polite">
          {strings["ivrs.pressed"] ?? t("ivrs.pressed")}: {last}
        </p>
      )}
    </section>
  );
}
