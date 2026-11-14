/**
 * Database documents → staff API shapes (API_CONTRACTS §2). Decrypts only
 * what the caller is already authorised to see; role shaping happens after,
 * in core/policies/serializers.
 */
import type { AssessmentDto, IndicatorDto, RecommendationDto } from "@/contracts/staff";
import { decrypt } from "@/core/privacy/crypto";
import { User } from "@/models";

const iso = (d: unknown) => new Date(d as string | number | Date).toISOString();
const ID = (v: unknown) => String(v);

/** id → display name for staff users (one query). */
export async function userNames(ids: (unknown | null | undefined)[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter(Boolean).map(ID))];
  if (!unique.length) return new Map();
  const users = await User.find({ _id: { $in: unique } }).select("name").lean();
  return new Map(users.map((u) => [ID(u._id), u.name]));
}

export function userRef(id: unknown, names: Map<string, string>) {
  return id ? { id: ID(id), name: names.get(ID(id)) ?? "Former staff member" } : null;
}

type Dims = AssessmentDto["dimensions"];

export function assessmentDto(a: {
  _id: unknown;
  interactionId: unknown;
  seq: number;
  trigger: string;
  svi: number;
  computedBand: string;
  band: string;
  overridesFired?: string[];
  dimensions: unknown;
  confidence: number;
  limitedConfidence?: boolean;
  topEvidence?: { indicatorId?: unknown; dimension?: string | null; label?: string | null }[];
  explanation: string;
  configVersion: number;
  createdAt?: unknown;
}): AssessmentDto {
  const raw = (a.dimensions instanceof Map ? Object.fromEntries(a.dimensions) : a.dimensions) as Record<string, Dims[keyof Dims]>;
  const dimensions: Dims = {};
  for (const [k, v] of Object.entries(raw ?? {})) {
    if (!v) continue;
    dimensions[k as keyof Dims] = {
      score: v.score,
      confidence: v.confidence,
      contribution: v.contribution,
      bySource: v.bySource ?? {},
    };
  }
  return {
    id: ID(a._id),
    interactionId: ID(a.interactionId),
    seq: a.seq,
    trigger: a.trigger as AssessmentDto["trigger"],
    svi: a.svi,
    computedBand: a.computedBand as AssessmentDto["band"],
    band: a.band as AssessmentDto["band"],
    overridesFired: a.overridesFired ?? [],
    dimensions,
    confidence: a.confidence,
    limitedConfidence: a.limitedConfidence ?? false,
    topEvidence: (a.topEvidence ?? []).map((e) => ({
      indicatorId: e.indicatorId ? ID(e.indicatorId) : null,
      dimension: e.dimension as AssessmentDto["topEvidence"][number]["dimension"],
      label: e.label ?? "",
    })),
    explanation: a.explanation,
    configVersion: a.configVersion,
    createdAt: iso(a.createdAt ?? Date.now()),
  };
}

export function indicatorDto(
  d: {
    _id: unknown;
    dimension: string;
    source: string;
    score: number;
    confidence: number;
    negated?: boolean | null;
    status?: string | null;
    flags?: string[] | null;
    label?: string | null;
    evidence?: { type?: string | null; messageId?: unknown; spanStart?: number | null; spanEnd?: number | null; quoteEnc?: string | null } | null;
    review?: { score?: number | null; reason?: string | null; byUserId?: unknown; at?: unknown } | null;
    modelVersion: string;
    createdAt?: unknown;
  },
  names: Map<string, string>,
): IndicatorDto {
  const ev = d.evidence ?? {};
  let quote: string | null = null;
  if (ev.quoteEnc) {
    try {
      quote = decrypt(ev.quoteEnc);
    } catch {
      quote = null; // purged or unreadable: show the indicator without its quote
    }
  }
  const evidence: IndicatorDto["evidence"] =
    ev.type === "TEXT_SPAN" && ev.messageId
      ? { type: "TEXT_SPAN", messageId: ID(ev.messageId), spanStart: ev.spanStart ?? 0, spanEnd: ev.spanEnd ?? 0, quote }
      : { type: (ev.type ?? "CONTEXT_FIELD") as "ACOUSTIC_EVENT" | "SCREENER_ANSWER" | "CONTEXT_FIELD" };
  return {
    id: ID(d._id),
    dimension: d.dimension as IndicatorDto["dimension"],
    source: d.source as IndicatorDto["source"],
    score: d.score,
    confidence: d.confidence,
    negated: d.negated ?? false,
    status: (d.status ?? "ACTIVE") as IndicatorDto["status"],
    flags: d.flags ?? [],
    label: d.label ?? null,
    evidence,
    review:
      d.review?.byUserId && d.review.at
        ? { score: d.review.score ?? null, reason: d.review.reason ?? "", by: userRef(d.review.byUserId, names)!, at: iso(d.review.at) }
        : null,
    modelVersion: d.modelVersion,
    createdAt: iso(d.createdAt ?? Date.now()),
  };
}

export function recommendationDto(
  r: {
    _id: unknown;
    type: string;
    ruleId: string;
    reason: string;
    urgency: string;
    dueAt?: unknown;
    responsibleRole: string;
    legalBasis?: string | null;
    status: string;
    decision?: { byUserId?: unknown; at?: unknown; reason?: string | null } | null;
    referralId?: unknown;
  },
  names: Map<string, string>,
): RecommendationDto {
  return {
    id: ID(r._id),
    type: r.type as RecommendationDto["type"],
    ruleId: r.ruleId,
    reason: r.reason,
    urgency: r.urgency as RecommendationDto["urgency"],
    ...(r.dueAt ? { dueAt: iso(r.dueAt) } : {}),
    responsibleRole: r.responsibleRole as RecommendationDto["responsibleRole"],
    ...(r.legalBasis ? { legalBasis: r.legalBasis } : {}),
    status: r.status as RecommendationDto["status"],
    ...(r.decision?.byUserId && r.decision.at
      ? { decision: { by: userRef(r.decision.byUserId, names)!, at: iso(r.decision.at), ...(r.decision.reason ? { reason: r.decision.reason } : {}) } }
      : {}),
    ...(r.referralId ? { referralId: ID(r.referralId) } : {}),
  };
}
