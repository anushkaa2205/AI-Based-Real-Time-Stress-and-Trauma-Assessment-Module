"use client";

/**
 * Reads one demo case back from the module through the staff API, as the signed-in presenter
 * (API_CONTRACTS §6.5). Polls only the cheap current-assessment endpoint; when a new assessment
 * lands it fetches indicators, recommendations and (for calls) transcript and voice windows.
 * Nothing is computed here: the page shows what the module returned.
 */
import { useCallback, useEffect, useRef, useState } from "react";

export interface AssessmentView {
  id: string;
  seq: number;
  trigger: string;
  svi: number;
  computedBand: string;
  band: string;
  overridesFired: string[];
  dimensions: Record<string, { score: number; confidence: number; contribution: number; bySource: Record<string, number> }>;
  confidence: number;
  limitedConfidence: boolean;
  explanation: string;
  configVersion: number;
  createdAt: string;
}

export interface IndicatorView {
  id: string;
  dimension: string;
  source: string;
  score: number;
  confidence: number;
  negated: boolean;
  flags: string[];
  label: string | null;
  evidence: { type: string; messageId?: string; quote?: string | null; cue?: string | null; startMs?: number; endMs?: number; field?: string | null };
  modelVersion: string;
  createdAt: string;
}

export interface RecommendationView {
  id: string;
  type: string;
  reason: string;
  urgency: string;
  responsibleRole: string;
  status: string;
}

export interface TranscriptView {
  id: string;
  seq: number;
  sender: string;
  modality: string;
  text: string;
}

export interface VoiceWindowView {
  windowIndex: number;
  startMs: number;
  endMs: number;
  emotion: { label: string; confidence: number } | null;
  fusedEmotion: { label: string; confidence: number } | null;
  pauses: { count: number; silenceRatio: number };
  speechRateWpm: number | null;
}

export interface ModuleResults {
  assessment: AssessmentView | null;
  history: { seq: number; svi: number; band: string; trigger: string }[];
  indicators: IndicatorView[];
  recommendations: RecommendationView[];
  transcript: TranscriptView[];
  voice: VoiceWindowView[];
  error: string | null;
  updatedAt: number | null;
}

const EMPTY: ModuleResults = { assessment: null, history: [], indicators: [], recommendations: [], transcript: [], voice: [], error: null, updatedAt: null };
const POLL_MS = 2_500;

async function get<T>(url: string): Promise<{ status: number; data: T | null }> {
  const res = await fetch(url, { cache: "no-store" });
  return { status: res.status, data: res.ok ? ((await res.json()) as T) : null };
}

export function useModuleResults(target: { interactionId: string; caseId: string | null } | null, opts: { call?: boolean; active: boolean }) {
  const [results, setResults] = useState<ModuleResults>(EMPTY);
  const lastSeq = useRef<number>(-1);
  const busy = useRef(false);
  const interactionId = target?.interactionId ?? null;
  const caseId = target?.caseId ?? null;
  const call = opts.call === true;

  const load = useCallback(
    async (force: boolean) => {
      if (!interactionId || busy.current) return;
      busy.current = true;
      try {
        const base = `/api/v1/staff/interactions/${interactionId}`;
        const cur = await get<AssessmentView>(`${base}/assessments/current`);
        if (cur.status === 404) {
          setResults((r) => ({ ...r, error: null, updatedAt: Date.now() }));
          if (!force) return;
        } else if (!cur.data) {
          setResults((r) => ({ ...r, error: `The module answered ${cur.status}` }));
          return;
        }
        const seq = cur.data?.seq ?? -1;
        if (!force && seq === lastSeq.current) return;
        lastSeq.current = seq;
        const [hist, inds, detail, tr, vw] = await Promise.all([
          get<{ items: AssessmentView[] }>(`${base}/assessments`),
          get<{ items: IndicatorView[] }>(`${base}/indicators`),
          caseId ? get<{ recommendations: RecommendationView[] }>(`/api/v1/staff/cases/${caseId}`) : Promise.resolve({ status: 0, data: null }),
          call ? get<{ items: TranscriptView[] }>(`${base}/transcript`) : Promise.resolve({ status: 0, data: null }),
          call ? get<{ items: VoiceWindowView[] }>(`${base}/voice`) : Promise.resolve({ status: 0, data: null }),
        ]);
        setResults({
          assessment: cur.data,
          history: (hist.data?.items ?? []).map((a) => ({ seq: a.seq, svi: a.svi, band: a.band, trigger: a.trigger })),
          indicators: inds.data?.items ?? [],
          recommendations: detail.data?.recommendations ?? [],
          transcript: tr.data?.items ?? [],
          voice: vw.data?.items ?? [],
          error: null,
          updatedAt: Date.now(),
        });
      } catch {
        setResults((r) => ({ ...r, error: "Could not reach the module" }));
      } finally {
        busy.current = false;
      }
    },
    [interactionId, caseId, call],
  );

  // A new interaction starts from nothing (adjusting state during render, not in an effect).
  const [forId, setForId] = useState(interactionId);
  if (forId !== interactionId) {
    setForId(interactionId);
    setResults(EMPTY);
  }
  useEffect(() => {
    lastSeq.current = -1;
  }, [interactionId]);

  useEffect(() => {
    if (!interactionId || !opts.active) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") void load(false);
    }, POLL_MS);
    return () => window.clearInterval(id);
  }, [interactionId, opts.active, load]);

  const refresh = useCallback(() => load(true), [load]);
  return { results, refresh };
}
