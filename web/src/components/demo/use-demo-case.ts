"use client";

/**
 * One demo case from the browser's side (NIVARA_FLOW_AND_UI_PLAN.md §6.3, task N.7): start it,
 * send input through /api/demo, finish it and learn the docket number. The page never learns
 * anything about the assessment; the only risk signal it may show is the emergency panel (rule 1).
 */
import { useCallback, useState } from "react";
import type { DemoMode, DemoReceipt } from "@/contracts/demo";
import type { EmergencyPanel, VictimLang } from "@/contracts/interaction";
import { consentRequest, type DemoConsent } from "./consent-fields";

export type DemoPhase = "consent" | "input" | "finishing" | "registered";

export interface DemoCase {
  phase: DemoPhase;
  interactionId: string | null;
  docketNumber: string | null;
  language: VictimLang;
  emergency: EmergencyPanel | null;
  error: string | null;
  /** The problem code behind `error`, for pages that act on one (LINE_BUSY) */
  errorCode: string | null;
  busy: boolean;
  start(input: { mode: DemoMode; language: VictimLang; districtCode: string; consent: DemoConsent; takeover?: boolean }): Promise<boolean>;
  finish(): Promise<void>;
  reset(): void;
  /** Reads a demo reply: records the emergency panel if the module raised it. */
  receipt(r: DemoReceipt | null | undefined): void;
  setError(msg: string | null): void;
}

export const DEMO_ERRORS: Record<string, string> = {
  LINE_BUSY: "The demo line is busy with another caller. Try typing instead, or come back in a few minutes.",
  RATE_LIMITED: "You have reached the demo's limit for now. Please try again a little later.",
  CONSENT_REQUIRED: "That input needs a consent you did not give. Start again and tick it.",
  INTERACTION_ENDED: "This case has already been registered.",
  NOT_FOUND: "This case is not one of yours, or the demo is switched off.",
  ANALYSIS_DEGRADED: "The module could not be reached. Please try again.",
};

export async function demoFetch<T>(url: string, init: RequestInit = {}): Promise<{ ok: boolean; status: number; data: T | null; code: string | null; detail: string | null }> {
  const res = await fetch(url, { credentials: "same-origin", ...init });
  let data: (T & { code?: string; detail?: string }) | null = null;
  try {
    data = (await res.json()) as T & { code?: string; detail?: string };
  } catch {
    data = null;
  }
  return { ok: res.ok, status: res.status, data: res.ok ? data : null, code: res.ok ? null : (data?.code ?? "ANALYSIS_DEGRADED"), detail: res.ok ? null : (data?.detail ?? null) };
}

export function messageFor(code: string | null, detail: string | null): string {
  return (code && DEMO_ERRORS[code]) ?? detail ?? DEMO_ERRORS.ANALYSIS_DEGRADED!;
}

export function useDemoCase(): DemoCase {
  const [phase, setPhase] = useState<DemoPhase>("consent");
  const [interactionId, setInteractionId] = useState<string | null>(null);
  const [docketNumber, setDocketNumber] = useState<string | null>(null);
  const [language, setLanguage] = useState<VictimLang>("en");
  const [emergency, setEmergency] = useState<EmergencyPanel | null>(null);
  const [error, setErrorText] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const setError = useCallback((msg: string | null, code: string | null = null) => {
    setErrorText(msg);
    setErrorCode(code);
  }, []);

  const start = useCallback<DemoCase["start"]>(async (input) => {
    setBusy(true);
    setError(null);
    const r = await demoFetch<{ interactionId: string }>("/api/demo/interactions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        mode: input.mode,
        language: input.language,
        districtCode: input.districtCode,
        consent: consentRequest(input.consent, input.language),
        ...(input.takeover ? { takeover: true } : {}),
      }),
    });
    setBusy(false);
    if (!r.data?.interactionId) {
      setError(messageFor(r.code, r.detail), r.code);
      return false;
    }
    setLanguage(input.language);
    setInteractionId(r.data.interactionId);
    setEmergency(null);
    setPhase("input");
    return true;
  }, [setError]);

  const finish = useCallback(async () => {
    if (!interactionId) return;
    setBusy(true);
    setPhase("finishing");
    setError(null);
    const r = await demoFetch<{ docketNumber: string }>(`/api/demo/interactions/${interactionId}/end`, { method: "POST" });
    setBusy(false);
    if (!r.data?.docketNumber) {
      setError(messageFor(r.code, r.detail), r.code);
      setPhase("input");
      return;
    }
    setDocketNumber(r.data.docketNumber);
    setPhase("registered");
  }, [interactionId, setError]);

  const reset = useCallback(() => {
    setPhase("consent");
    setInteractionId(null);
    setDocketNumber(null);
    setEmergency(null);
    setError(null);
  }, [setError]);

  const receipt = useCallback((r: DemoReceipt | null | undefined) => {
    if (r?.showEmergencyPanel && r.emergency) setEmergency(r.emergency);
  }, []);

  return { phase, interactionId, docketNumber, language, emergency, error, errorCode, busy, start, finish, reset, receipt, setError };
}
