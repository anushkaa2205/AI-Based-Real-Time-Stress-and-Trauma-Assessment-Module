/**
 * Score an interaction and persist the result (shared by the message pipeline,
 * indicator review (task 5.4) and the rescore job (task 5.7)).
 *
 *   stored indicators + context → assess → assessment → case rank →
 *   recommendations → alert → real-time events (returned; published after commit)
 *
 * Runs inside the caller's transaction. Without analysis consent (SAFETY_ONLY)
 * no SVI is calculated (AC-CON-03): only life-safety overrides (from the safety lexicon and
 * from case details in NHAA's record) can raise the band.
 */
import type { ClientSession, Types } from "mongoose";
import { record } from "@/core/audit/record";
import { allowsAnyAnalysis, allowsTextAnalysis } from "@/core/consent/mode";
import { dueAt, evaluateRecommendations, type Proposal } from "@/core/recommendations/evaluate";
import { LEXICON_VERSION } from "@/core/safety-lexicon/engine";
import { assess } from "@/core/scoring/assess";
import { bandRank, maxBand } from "@/core/scoring/bands";
import { contextSignals, type CaseContextInput } from "@/core/scoring/context";
import { applyOverrides, flagsFrom } from "@/core/scoring/overrides";
import type { CaseFact, IndicatorInput, OverrideFlag, RiskBand, ScoringConfig } from "@/core/scoring/types";
import {
  ONCALL,
  interactionChannel,
  queueChannelsFor,
  type CaseEventData,
  type OutboundEvent,
} from "@/lib/realtime/channels";
import { Alert, Assessment, Indicator, Job, Recommendation, URGENCIES, type ActorType, type CaseDoc, type IndicatorStatus, type InteractionDoc, type Urgency } from "@/models";
import { Types as MTypes, type HydratedDocument } from "mongoose";

const ID = (v: unknown) => String(v);
const isObjectId = (s: string | null | undefined): s is string => !!s && /^[a-f0-9]{24}$/.test(s);

export type Trigger = "TEXT_MESSAGE" | "VOICE_WINDOW" | "CONTEXT_UPDATE" | "INDICATOR_REVIEW" | "CONFIG_RESCORE";

/** Turns stored indicator docs into scoring input. */
export function toInput(doc: {
  _id: unknown;
  dimension: string;
  source: string;
  score: number;
  confidence: number;
  negated?: boolean | null;
  status?: string | null;
  review?: { score?: number | null } | null;
  flags?: string[] | null;
  label?: string | null;
}): IndicatorInput {
  return {
    id: ID(doc._id),
    dimension: doc.dimension as IndicatorInput["dimension"],
    source: doc.source as IndicatorInput["source"],
    score: doc.score,
    confidence: doc.confidence,
    negated: doc.negated ?? false,
    status: (doc.status ?? "ACTIVE") as IndicatorStatus,
    reviewScore: doc.review?.score ?? null,
    flags: (doc.flags ?? []) as OverrideFlag[],
    ...(doc.label ? { label: doc.label } : {}),
  };
}

/** IMMEDIATE is the most urgent; NONE the least. */
const urgencyRank = (u: Urgency) => URGENCIES.length - URGENCIES.indexOf(u);

/** Insert new proposals, keep unchanged ones, supersede stale ones, in ONE round trip (DATABASE §6). */
async function persistRecommendations(
  session: ClientSession,
  ids: { caseId: Types.ObjectId; interactionId: Types.ObjectId; assessmentId: Types.ObjectId },
  proposals: Proposal[],
  now: Date,
): Promise<OutboundEvent[]> {
  const open = await Recommendation.find({ caseId: ids.caseId, status: { $in: ["PROPOSED", "AUTO_TRIGGERED", "APPROVED", "REJECTED"] } })
    .select("ruleId type status urgency")
    .session(session)
    .lean();

  const supersede = new Set<string>();
  const inserts: (Record<string, unknown> & { _id: Types.ObjectId })[] = [];
  const wanted = new Set(proposals.map((p) => p.ruleId));
  for (const rec of open) {
    // Stale proposals, and the automatic Low-band information once the band has risen.
    // Auto-triggered emergency support stays until a human reviews it (FR-REC-05).
    const staleInfo = rec.status === "AUTO_TRIGGERED" && rec.type === "INFORMATION";
    if ((rec.status === "PROPOSED" || staleInfo) && !wanted.has(rec.ruleId)) supersede.add(ID(rec._id));
  }
  for (const p of proposals) {
    // A human rejected this rule for this case: propose it again only if it became more urgent.
    const rejected = open.find((r) => r.ruleId === p.ruleId && r.status === "REJECTED" && urgencyRank(p.urgency) <= urgencyRank(r.urgency as Urgency));
    if (rejected) continue;
    const existing = open.find((r) => r.ruleId === p.ruleId && r.status !== "REJECTED" && !supersede.has(ID(r._id)));
    if (existing && (existing.status !== "PROPOSED" || existing.urgency === p.urgency)) continue;
    if (existing) supersede.add(ID(existing._id));
    inserts.push({
      _id: new MTypes.ObjectId(),
      ...ids,
      type: p.type,
      ruleId: p.ruleId,
      reason: p.reason,
      urgency: p.urgency,
      dueAt: dueAt(p.urgency, now.getTime()) ?? undefined,
      responsibleRole: p.responsibleRole,
      legalBasis: p.legalBasis,
      status: p.status,
    });
  }
  const ops = [
    ...[...supersede].map((id) => ({
      updateOne: { filter: { _id: new MTypes.ObjectId(id) }, update: { $set: { status: "SUPERSEDED", updatedAt: now } } },
    })),
    ...inserts.map((doc) => ({ insertOne: { document: { ...doc, createdAt: now, updatedAt: now } } })),
  ];
  if (ops.length) await Recommendation.bulkWrite(ops as never, { session, ordered: true });
  return inserts.map((r) => ({
    channel: interactionChannel(ID(ids.interactionId)),
    event: "recommendation.created" as const,
    data: { recommendationId: ID(r._id), type: String(r.type), urgency: String(r.urgency), status: String(r.status) },
  }));
}

/** FR-ALR-01/03/04: alert when the band rises to High or Critical; Critical escalates if not acknowledged. */
async function raiseAlertIfNeeded(
  session: ClientSession,
  args: { caseDoc: HydratedDocument<CaseDoc>; interactionId: Types.ObjectId; prev: RiskBand | null; next: RiskBand; reason: string },
  config: ScoringConfig,
  now: Date,
): Promise<OutboundEvent[]> {
  const { prev, next, caseDoc } = args;
  if (next !== "HIGH" && next !== "CRITICAL") return [];
  if (prev && bandRank(prev) >= bandRank(next)) return [];
  const escalateAt = next === "CRITICAL" ? new Date(now.getTime() + config.alertPolicy.criticalAckTimeoutSec * 1000) : undefined;
  const alert = await Alert.findOneAndUpdate(
    { caseId: caseDoc._id, level: next, status: "OPEN" },
    {
      $setOnInsert: { caseId: caseDoc._id, interactionId: args.interactionId, level: next, status: "OPEN", escalationLevel: 0 },
      $set: { reason: args.reason, ...(escalateAt ? { escalateAt } : {}) },
    },
    { upsert: true, returnDocument: "after", session },
  );
  if (next === "CRITICAL") {
    // The Critical alert replaces a lower open one, so responders see one alert per case.
    await Alert.updateMany({ caseId: caseDoc._id, level: "HIGH", status: "OPEN" }, { $set: { status: "RESOLVED", resolvedAt: now } }, { session });
  }
  if (escalateAt && alert) {
    await Job.create([{ type: "alert.escalate", payload: { alertId: ID(alert._id), level: 1 }, runAt: escalateAt }], { session });
  }
  if (!alert) return [];
  const data = {
    alertId: ID(alert._id),
    caseId: ID(caseDoc._id),
    docketNumber: caseDoc.docketNumber,
    level: next,
    reason: args.reason,
    createdAt: (alert.createdAt ?? now).toISOString(),
  };
  // On-call only: district officers see an alert once it escalates to them (matrix §4),
  // and queue channels also reach roles with reduced access.
  return [{ channel: ONCALL, event: "alert.created" as const, data }];
}

export function caseEventData(caseDoc: CaseDoc & { _id: unknown }): CaseEventData {
  return {
    caseId: ID(caseDoc._id),
    docketNumber: caseDoc.docketNumber,
    band: (caseDoc.currentBand ?? null) as RiskBand | null,
    svi: caseDoc.currentSvi ?? null,
    status: caseDoc.status,
    assignedToId: caseDoc.assignedCounsellorId ? ID(caseDoc.assignedCounsellorId) : null,
    waitingSince: new Date(caseDoc.waitingSince ?? Date.now()).toISOString(),
  };
}

export interface ScoreOptions {
  trigger: Trigger;
  now: Date;
  config: ScoringConfig;
  actor: { type: ActorType; id: string };
  /** Life-safety lexicon hits from THIS turn (used for overrides even without text consent) */
  lexiconActive?: IndicatorInput[];
  nlpVersion?: string | null;
  /** This turn's AI call failed (the case stays limited until the rescore job succeeds) */
  aiDegraded?: boolean;
  /** Force the limited-confidence flag (e.g. the rescore job clears it) */
  limitedConfidence?: boolean;
  /** This voice window could not be attributed to one speaker yet (only one voice heard so far, M.10) */
  voiceLimited?: boolean;
}

export interface ScoreResult {
  band: RiskBand | null;
  previousBand: RiskBand | null;
  assessmentId: string | null;
  events: OutboundEvent[];
}

export async function scoreInteraction(
  session: ClientSession,
  interaction: HydratedDocument<InteractionDoc>,
  caseDoc: HydratedDocument<CaseDoc>,
  opts: ScoreOptions,
): Promise<ScoreResult> {
  const { config, now } = opts;
  const mode = interaction.mode;
  const prevBand = (caseDoc.currentBand ?? null) as RiskBand | null;
  const ctx = (interaction.context ?? {}) as CaseContextInput;
  const lexiconActive = opts.lexiconActive ?? [];
  const events: OutboundEvent[] = [];
  let newBand: RiskBand | null = prevBand;
  let reason = "";
  let assessmentId: string | null = null;

  // FR-RISK-03: after a human band override, automatic safety overrides fire only on evidence
  // newer than that decision, so the same old evidence cannot undo it. New danger still raises.
  const lastOverrideAt = caseDoc.bandOverrides?.length ? new Date(caseDoc.bandOverrides.at(-1)!.at).getTime() : null;
  const isNew = (at: unknown) => lastOverrideAt === null || (at instanceof Date || typeof at === "string" ? new Date(at).getTime() > lastOverrideAt : false);
  const context = contextSignals(ctx);
  const contextIsNew = isNew((interaction.context as { updatedAt?: Date } | undefined)?.updatedAt);

  if (allowsAnyAnalysis(mode)) {
    // FR-VOI-10 (task M.10): two-voice audio that could not be separated keeps every later assessment
    // limited, whatever the AI state or a rescore says.
    const unseparated = interaction.voiceUnseparated === true;
    const limitedConfidence = (opts.limitedConfidence ?? (opts.aiDegraded === true || caseDoc.limitedConfidence === true)) || unseparated || opts.voiceLimited === true;
    const stored = await Indicator.find({ interactionId: interaction._id, status: { $ne: "REJECTED" } })
      .select("dimension source score confidence negated status review flags label createdAt")
      .session(session)
      .lean();
    // Without text consent the lexicon still protects life: its flags count, its scores do not.
    const lexiconFlagsOnly: IndicatorInput[] = !allowsTextAnalysis(mode) ? lexiconActive.map((i) => ({ ...i, score: 0, confidence: 0 })) : [];
    const storedFacts = allowsTextAnalysis(mode) ? ((interaction.caseFacts ?? []) as CaseFact[]) : [];
    const facts = [...new Set<CaseFact>([...context.facts, ...storedFacts])];

    const indicators = [...stored.map(toInput), ...lexiconFlagsOnly, ...context.indicators];
    let flags: Set<OverrideFlag> | undefined;
    if (lastOverrideAt !== null) {
      const recent = [
        ...stored.filter((d) => isNew(d.createdAt)).map(toInput),
        ...lexiconFlagsOnly,
        ...lexiconActive,
        ...(contextIsNew ? context.indicators : []),
      ];
      flags = flagsFrom(recent);
    }

    const draft = assess({
      indicators,
      config,
      lockedBand: (caseDoc.overrideLockedBand ?? null) as RiskBand | null,
      limitedConfidence,
      ...(flags ? { flags } : {}),
    });

    interaction.assessmentSeq = (interaction.assessmentSeq ?? 0) + 1;
    const [assessment] = await Assessment.create(
      [
        {
          interactionId: interaction._id,
          caseId: caseDoc._id,
          seq: interaction.assessmentSeq,
          trigger: opts.trigger,
          svi: draft.svi,
          computedBand: draft.computedBand,
          band: draft.band,
          overridesFired: draft.overridesFired,
          dimensions: draft.dimensions,
          confidence: draft.confidence,
          limitedConfidence: draft.limitedConfidence,
          topEvidence: draft.topEvidence.map((e) => ({
            indicatorId: isObjectId(e.indicatorId) ? e.indicatorId : undefined,
            dimension: e.dimension,
            label: e.label,
          })),
          explanation: draft.explanation.en,
          configVersion: draft.configVersion,
          modelVersions: { lexicon: LEXICON_VERSION, nlp: opts.nlpVersion ?? null },
        },
      ],
      { session },
    );
    assessmentId = ID(assessment!._id);
    interaction.current = { assessmentId: assessment!._id, svi: draft.svi, band: draft.band, confidence: draft.confidence, at: now } as never;

    caseDoc.currentBand = draft.band;
    caseDoc.bandRank = bandRank(draft.band);
    caseDoc.currentSvi = draft.svi;
    caseDoc.latestAssessmentId = assessment!._id;
    caseDoc.overrideLockedBand = draft.lockedBand ?? undefined;
    caseDoc.limitedConfidence = limitedConfidence;

    const proposals = evaluateRecommendations(
      { band: draft.band, overridesFired: draft.overridesFired, dimensions: draft.dimensions, facts },
      config,
    );
    events.push(
      ...(await persistRecommendations(session, { caseId: caseDoc._id, interactionId: interaction._id, assessmentId: assessment!._id }, proposals, now)),
    );
    newBand = draft.band;
    reason = draft.explanation.en;
    await record(
      {
        actorType: opts.actor.type,
        actorId: opts.actor.id,
        action: "assessment.create",
        entityType: "assessment",
        entityId: assessmentId,
        metadata: { trigger: opts.trigger, svi: draft.svi, band: draft.band, configVersion: draft.configVersion },
      },
      session,
    );
    events.push({
      channel: interactionChannel(ID(interaction._id)),
      event: "assessment.updated",
      data: {
        interactionId: ID(interaction._id),
        assessmentId,
        seq: interaction.assessmentSeq,
        svi: draft.svi,
        band: draft.band,
        previousBand: prevBand,
        overridesFired: draft.overridesFired,
        topEvidence: draft.topEvidence.map((e) => ({ dimension: e.dimension, label: e.label })),
        confidence: draft.confidence,
        limitedConfidence: draft.limitedConfidence,
      },
    });
  } else {
    // SAFETY_ONLY: no SVI. Life-safety overrides still fire from what the person says (lexicon) and
    // from case details in NHAA's record (e.g. accusedNearby → OV-2); they only ever raise (rule 5).
    const flags = new Set<OverrideFlag>([...flagsFrom(lexiconActive), ...flagsFrom(contextIsNew ? context.indicators : [])]);
    const locked = (caseDoc.overrideLockedBand ?? null) as RiskBand | null;
    const r = applyOverrides("LOW", flags, config.safetyOverrides, locked);
    if (r.fired.length) {
      newBand = maxBand(prevBand, r.band);
      caseDoc.currentBand = newBand;
      caseDoc.bandRank = bandRank(newBand);
      caseDoc.overrideLockedBand = r.lockedBand ?? undefined;
      const rule = config.safetyOverrides.find((o) => o.id === r.fired[0]);
      reason = `Safety lexicon / case details only (no analysis consent): ${rule?.label.en ?? r.fired[0]} (${r.fired.join(", ")})`;
      await record(
        {
          actorType: opts.actor.type,
          actorId: opts.actor.id,
          action: "safety.override",
          entityType: "case",
          entityId: ID(caseDoc._id),
          metadata: { overridesFired: r.fired, band: newBand },
        },
        session,
      );
    }
  }

  if (newBand) {
    events.push(
      ...(await raiseAlertIfNeeded(session, { caseDoc, interactionId: interaction._id, prev: prevBand, next: newBand, reason }, config, now)),
    );
  }
  const districtId = caseDoc.districtId ? ID(caseDoc.districtId) : null;
  for (const channel of queueChannelsFor(districtId)) {
    events.push({ channel, event: "case.updated", data: caseEventData(caseDoc) });
    if (assessmentId) {
      events.push({ channel, event: "assessment.updated", data: { caseId: ID(caseDoc._id), band: newBand, svi: caseDoc.currentSvi ?? null } });
    }
  }
  return { band: newBand, previousBand: prevBand, assessmentId, events };
}
