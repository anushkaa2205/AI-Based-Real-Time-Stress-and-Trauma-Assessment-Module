"use client";

/**
 * The portal journey's state (Phase P, task P.7; NIVARA_FLOW_AND_UI_PLAN.md §6.3). It lives in the
 * `/start` layout, so it survives the move from step 2 (`/start`) to steps 3–5 (`/start/write`,
 * `/start/speak`), and is held in memory only: a reload or Quick exit clears it.
 *
 * Every assistant line is the text of a scripted question the module returned and the server recorded
 * as an OPERATOR turn (P-D4); the page never writes one. The page never learns anything about the
 * assessment beyond the emergency panel (rule 1).
 */
import { useLocale } from "next-intl";
import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import type { DemoAudioReceipt, DemoMode, DemoNextQuestion, DemoQuestion, DemoReceipt, DemoStarted } from "@/contracts/demo";
import { toVictimLang, type EmergencyPanel, type VictimLang } from "@/contracts/interaction";
import { consentRequest, DEFAULT_DISTRICT, FULL_CONSENT, type DemoConsent } from "./consent-fields";
import { errorKey, postJson, type KNOWN_ERRORS } from "./portal-api";

export interface Turn {
  key: string;
  who: "assistant" | "person";
  /** Assistant: the scripted question as shown. Person: their own words (typed, or heard for Speak). */
  text: string;
  state: "sending" | "sent" | "failed";
  /** The scripted closing line (shown only, never recorded) */
  closing?: boolean;
}

export type Stage = "conversation" | "review" | "registered";
type ErrorCode = (typeof KNOWN_ERRORS)[number];

interface PortalState {
  district: string;
  setDistrict(v: string): void;
  consent: DemoConsent;
  setConsent(v: DemoConsent): void;
  /** Step 1 completed */
  ready: boolean;
  setReady(v: boolean): void;

  mode: DemoMode | null;
  language: VictimLang | null;
  interactionId: string | null;
  turns: Turn[];
  emergency: EmergencyPanel | null;
  docketNumber: string | null;
  stage: Stage;
  busy: boolean;
  error: ErrorCode | null;
  setError(code: ErrorCode | null): void;
  /** No more scripted questions in this conversation */
  closed: boolean;

  start(mode: DemoMode, takeover?: boolean): Promise<boolean>;
  sendText(text: string): Promise<void>;
  skip(): Promise<void>;
  /** Speak: one window's reply (the emergency panel, and the person's own heard words) */
  audioReply(r: DemoAudioReceipt): void;
  /** Speak: the person pressed Done; their heard words become one answer, then the next question comes */
  finishAnswer(): Promise<void>;
  toReview(): void;
  toConversation(): void;
  submit(note: string): Promise<void>;
  reset(): void;
}

const Ctx = createContext<PortalState | null>(null);

export function usePortal(): PortalState {
  const c = useContext(Ctx);
  if (!c) throw new Error("usePortal must be used inside <PortalProvider>");
  return c;
}

let seq = 0;
const key = () => `t${Date.now().toString(36)}${(seq++).toString(36)}`;
const assistant = (q: DemoQuestion): Turn => ({ key: key(), who: "assistant", text: q.text, state: "sent" });
const closingTurn = (): Turn => ({ key: key(), who: "assistant", text: "", state: "sent", closing: true });

export function PortalProvider({ children }: { children: React.ReactNode }) {
  const locale = useLocale();
  const [district, setDistrict] = useState(DEFAULT_DISTRICT);
  const [consent, setConsent] = useState<DemoConsent>(FULL_CONSENT);
  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState<DemoMode | null>(null);
  const [language, setLanguage] = useState<VictimLang | null>(null);
  const [interactionId, setInteractionId] = useState<string | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [emergency, setEmergency] = useState<EmergencyPanel | null>(null);
  const [docketNumber, setDocket] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage>("conversation");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ErrorCode | null>(null);
  const [closed, setClosed] = useState(false);
  const heard = useRef<string[]>([]);
  const closedRef = useRef(false);

  const base = interactionId ? `/api/demo/interactions/${interactionId}` : "";

  const raise = useCallback((r: { showEmergencyPanel: boolean; emergency: EmergencyPanel | null } | null | undefined) => {
    if (r?.showEmergencyPanel && r.emergency) setEmergency(r.emergency);
  }, []);

  /** Adds the next question, or the closing line once nothing is left. */
  const follow = useCallback((q: DemoQuestion | null) => {
    if (q) setTurns((ts) => [...ts, assistant(q)]);
    else if (!closedRef.current) {
      closedRef.current = true;
      setClosed(true);
      setTurns((ts) => [...ts, closingTurn()]);
    }
  }, []);

  const start = useCallback<PortalState["start"]>(
    async (m, takeover) => {
      setBusy(true);
      setError(null);
      const lang = toVictimLang(locale); // the conversation's language is the site language now (P-D7)
      const r = await postJson<DemoStarted>("/api/demo/interactions", {
        mode: m,
        language: lang,
        districtCode: district,
        consent: consentRequest(consent, lang),
        ...(takeover ? { takeover: true } : {}),
      });
      setBusy(false);
      if (!r.data?.interactionId) {
        setError(errorKey(r.code));
        return false;
      }
      heard.current = [];
      closedRef.current = false;
      setMode(m);
      setLanguage(lang);
      setInteractionId(r.data.interactionId);
      setTurns(r.data.question ? [assistant(r.data.question)] : []);
      setEmergency(null);
      setDocket(null);
      setClosed(false);
      setStage("conversation");
      return true;
    },
    [locale, district, consent],
  );

  const sendText = useCallback<PortalState["sendText"]>(
    async (text) => {
      const clean = text.trim();
      if (!base || !clean) return;
      const k = key();
      setTurns((ts) => [...ts, { key: k, who: "person", text: clean, state: "sending" }]);
      setBusy(true);
      setError(null);
      const r = await postJson<DemoReceipt>(`${base}/messages`, { text: clean });
      setBusy(false);
      setTurns((ts) => ts.map((x) => (x.key === k ? { ...x, state: r.ok ? "sent" : "failed" } : x)));
      if (!r.ok || !r.data) return setError(errorKey(r.code));
      raise(r.data);
      follow(r.data.question);
    },
    [base, raise, follow],
  );

  const skip = useCallback<PortalState["skip"]>(async () => {
    if (!base) return;
    setBusy(true);
    setError(null);
    const r = await postJson<DemoNextQuestion>(`${base}/next-question`);
    setBusy(false);
    if (!r.ok || !r.data) return setError(errorKey(r.code));
    follow(r.data.question);
  }, [base, follow]);

  const audioReply = useCallback<PortalState["audioReply"]>(
    (r) => {
      raise(r);
      if (r.heard) heard.current.push(r.heard);
    },
    [raise],
  );

  const finishAnswer = useCallback<PortalState["finishAnswer"]>(async () => {
    const words = heard.current.join(" ").trim();
    heard.current = [];
    setTurns((ts) => [...ts, { key: key(), who: "person", text: words, state: "sent" }]);
    await skip(); // the next question is asked the same way as Skip: read it, record it, show it
  }, [skip]);

  const submit = useCallback<PortalState["submit"]>(
    async (note) => {
      if (!base) return;
      setBusy(true);
      setError(null);
      const n = note.trim();
      if (n) {
        const r = await postJson<DemoReceipt>(`${base}/messages`, { text: n, note: true });
        if (!r.ok) {
          setBusy(false);
          return setError(errorKey(r.code));
        }
        setTurns((ts) => [...ts, { key: key(), who: "person", text: n, state: "sent" }]);
        raise(r.data);
      }
      const end = await postJson<{ docketNumber: string }>(`${base}/end`);
      setBusy(false);
      if (!end.ok || !end.data?.docketNumber) return setError(errorKey(end.code));
      setDocket(end.data.docketNumber);
      setStage("registered");
    },
    [base, raise],
  );

  const reset = useCallback(() => {
    heard.current = [];
    closedRef.current = false;
    setReady(false);
    setMode(null);
    setLanguage(null);
    setInteractionId(null);
    setTurns([]);
    setEmergency(null);
    setDocket(null);
    setStage("conversation");
    setError(null);
    setClosed(false);
  }, []);

  const value = useMemo<PortalState>(
    () => ({
      district,
      setDistrict,
      consent,
      setConsent,
      ready,
      setReady,
      mode,
      language,
      interactionId,
      turns,
      emergency,
      docketNumber,
      stage,
      busy,
      error,
      setError,
      closed,
      start,
      sendText,
      skip,
      audioReply,
      finishAnswer,
      toReview: () => setStage("review"),
      toConversation: () => setStage("conversation"),
      submit,
      reset,
    }),
    [district, consent, ready, mode, language, interactionId, turns, emergency, docketNumber, stage, busy, error, closed, start, sendText, skip, audioReply, finishAnswer, submit, reset],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
