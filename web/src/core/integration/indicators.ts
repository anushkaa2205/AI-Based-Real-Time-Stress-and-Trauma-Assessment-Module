/**
 * Indicators with their evidence for an integrating system (task M.5, gap V1, FR-API-01, FR-IND-04,
 * API_CONTRACTS §6.4a). Behind the `indicators:read` scope, so each NHAA system receives only what it
 * is authorised to. Evidence is an exact quote with its character span (text), the window and its time
 * in the call (voice), or the case-detail field (context). Staff review details are not included.
 * The calling system must never show this to the person (CLAUDE.md rule 1).
 */
import { decrypt } from "@/core/privacy/crypto";
import { Indicator, VoiceWindow } from "@/models";

export type IntegrationEvidence =
  | { type: "TEXT_SPAN"; messageId: string; start: number; end: number; quote: string | null }
  | { type: "ACOUSTIC_EVENT"; cue: string | null; windowIndex: number | null; startMs: number | null; endMs: number | null }
  | { type: "CONTEXT_FIELD"; field: string | null };

export interface IntegrationIndicator {
  id: string;
  dimension: string;
  source: string;
  score: number;
  confidence: number;
  negated: boolean;
  status: string;
  flags: string[];
  evidence: IntegrationEvidence;
  createdAt: string;
}

export interface WindowTime {
  windowIndex: number;
  startMs: number;
  endMs: number;
}

interface IndicatorDocLike {
  _id: unknown;
  dimension: string;
  source: string;
  score: number;
  confidence: number;
  negated?: boolean | null;
  status?: string | null;
  flags?: string[] | null;
  evidence?: {
    type?: string | null;
    messageId?: unknown;
    spanStart?: number | null;
    spanEnd?: number | null;
    quoteEnc?: string | null;
    voiceWindowId?: unknown;
    eventType?: string | null;
    contextField?: string | null;
  } | null;
  createdAt?: unknown;
}

function openQuote(enc: string | null | undefined): string | null {
  if (!enc) return null;
  try {
    return decrypt(enc);
  } catch {
    return null; // purged after the retention period, or unreadable
  }
}

/** Evidence of one indicator; `windows` maps voice window ids to their place in the call. Pure apart from decryption. */
export function evidenceOf(ev: IndicatorDocLike["evidence"], windows: Map<string, WindowTime>): IntegrationEvidence {
  const e = ev ?? {};
  if (e.type === "TEXT_SPAN" && e.messageId) return { type: "TEXT_SPAN", messageId: String(e.messageId), start: e.spanStart ?? 0, end: e.spanEnd ?? 0, quote: openQuote(e.quoteEnc) };
  if (e.type === "ACOUSTIC_EVENT") {
    const w = e.voiceWindowId ? windows.get(String(e.voiceWindowId)) : undefined;
    return { type: "ACOUSTIC_EVENT", cue: e.eventType ?? null, windowIndex: w?.windowIndex ?? null, startMs: w?.startMs ?? null, endMs: w?.endMs ?? null };
  }
  return { type: "CONTEXT_FIELD", field: e.contextField ?? null };
}

export function integrationIndicator(d: IndicatorDocLike, windows: Map<string, WindowTime>): IntegrationIndicator {
  return {
    id: String(d._id),
    dimension: d.dimension,
    source: d.source,
    score: d.score,
    confidence: d.confidence,
    negated: d.negated ?? false,
    status: d.status ?? "ACTIVE",
    flags: d.flags ?? [],
    evidence: evidenceOf(d.evidence, windows),
    createdAt: new Date((d.createdAt as Date | string | number | undefined) ?? Date.now()).toISOString(),
  };
}

/** Voice window id → its place in the call, for the voice indicators of one interaction. */
export async function windowTimes(rows: { evidence?: { voiceWindowId?: unknown } | null }[]): Promise<Map<string, WindowTime>> {
  const ids = [...new Set(rows.map((r) => r.evidence?.voiceWindowId).filter(Boolean).map(String))];
  if (!ids.length) return new Map();
  const ws = await VoiceWindow.find({ _id: { $in: ids } }).select("windowIndex startMs endMs").lean();
  return new Map(ws.map((w) => [String(w._id), { windowIndex: w.windowIndex, startMs: w.startMs, endMs: w.endMs }]));
}

export async function listIntegrationIndicators(interactionId: string): Promise<IntegrationIndicator[]> {
  const rows = await Indicator.find({ interactionId }).sort({ createdAt: 1 }).limit(1000).lean();
  const windows = await windowTimes(rows);
  return rows.map((r) => integrationIndicator(r as IndicatorDocLike, windows));
}
