/**
 * Assessment pipeline v1, rules only (task 3.5, ARCHITECTURE §5, DATABASE §6).
 *
 *   consent check → store message (encrypted) → safety lexicon → indicators →
 *   fuse → SVI → band → overrides → assessment → case rank → recommendations → alert
 *
 * Everything for one turn is written in ONE MongoDB transaction. The safety
 * lexicon runs on every message in every mode (CLAUDE.md rule 4/6). Without
 * analysis consent (SAFETY_ONLY) no SVI is calculated (AC-CON-03): only the
 * life-safety overrides from the lexicon and the safety check can raise the
 * band, alert staff and show the emergency panel.
 *
 * The AI path (Phase 4) and real-time events after commit (Phase 5) plug in here.
 * Logs never contain victim text (rule 9).
 */
import mongoose, { type ClientSession, Types } from "mongoose";
import { record } from "@/core/audit/record";
import { allowsScreeners, allowsTextAnalysis, currentConsent, resolveMode } from "@/core/consent/mode";
import { flowStateOf, type FlowState } from "@/core/conversation/flow";
import { encrypt } from "@/core/privacy/crypto";
import { dueAt, evaluateRecommendations, type Proposal } from "@/core/recommendations/evaluate";
import { LEXICON_VERSION, lexiconSignals } from "@/core/safety-lexicon/engine";
import { activeConfig } from "@/core/scoring/activeConfig";
import { assess } from "@/core/scoring/assess";
import { bandRank, maxBand } from "@/core/scoring/bands";
import { contextSignals, isMinor, type CaseContextInput } from "@/core/scoring/context";
import { applyOverrides, flagsFrom } from "@/core/scoring/overrides";
import type { CaseFact, IndicatorInput, OverrideFlag, RiskBand, ScoringConfig } from "@/core/scoring/types";
import { scoreAll, screenerSignals, type ScreenerResponseInput } from "@/core/screeners/score";
import { shouldShowEmergency } from "@/core/victim/emergency";
import { db } from "@/lib/db";
import { ApiError } from "@/lib/problem";
import {
  Alert,
  Assessment,
  Case,
  Indicator,
  Interaction,
  Job,
  Message,
  Recommendation,
  type AssessmentMode,
  type IndicatorStatus,
} from "@/models";

export type Trigger = "TEXT_MESSAGE" | "SCREENER" | "CONTEXT_UPDATE";

export interface RunInput {
  interactionId: string;
  trigger: Trigger;
  message?: { text: string; promptKey?: string; idempotencyKey?: string };
  screener?: ScreenerResponseInput;
  context?: CaseContextInput;
  /** Skipping the free-text question ends the narrative step (FR-CH-09) */
  skipNarrative?: boolean;
}

export interface RunResult {
  messageId: string | null;
  showEmergencyPanel: boolean;
  replayed: boolean;
}

const ID = (v: unknown) => String(v);
const isObjectId = (s: string | null | undefined): s is string => !!s && /^[a-f0-9]{24}$/.test(s);

/** Turns stored indicator docs into scoring input. */
function toInput(doc: {
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

function screenerResponsesOf(i: { screenerResponses?: unknown }): ScreenerResponseInput[] {
  return ((i.screenerResponses ?? []) as ScreenerResponseInput[]).map((r) => ({
    instrument: r.instrument,
    itemCode: r.itemCode,
    value: r.value ?? null,
    skipped: r.skipped ?? false,
  }));
}

/** Insert new proposals, keep unchanged ones, supersede stale PROPOSED ones (DATABASE §6). */
async function persistRecommendations(
  session: ClientSession,
  ids: { caseId: Types.ObjectId; interactionId: Types.ObjectId; assessmentId: Types.ObjectId },
  proposals: Proposal[],
  now: Date,
) {
  const open = await Recommendation.find({
    caseId: ids.caseId,
    status: { $in: ["PROPOSED", "AUTO_TRIGGERED", "APPROVED"] },
  }).session(session);

  const wanted = new Set(proposals.map((p) => p.ruleId));
  for (const rec of open) {
    // Stale proposals, and the automatic Low-band information once the band has risen.
    // Auto-triggered emergency support stays until a human reviews it (FR-REC-05).
    const staleInfo = rec.status === "AUTO_TRIGGERED" && rec.type === "INFORMATION";
    if ((rec.status === "PROPOSED" || staleInfo) && !wanted.has(rec.ruleId)) {
      rec.status = "SUPERSEDED";
      await rec.save({ session });
    }
  }
  for (const p of proposals) {
    const existing = open.find((r) => r.ruleId === p.ruleId && r.status !== "SUPERSEDED");
    if (existing && (existing.status !== "PROPOSED" || existing.urgency === p.urgency)) continue;
    if (existing) {
      existing.status = "SUPERSEDED";
      await existing.save({ session });
    }
    await Recommendation.create(
      [
        {
          ...ids,
          type: p.type,
          ruleId: p.ruleId,
          reason: p.reason,
          urgency: p.urgency,
          dueAt: dueAt(p.urgency, now.getTime()) ?? undefined,
          responsibleRole: p.responsibleRole,
          legalBasis: p.legalBasis,
          status: p.status,
        },
      ],
      { session },
    );
  }
}

/** FR-ALR-01/03/04: alert when the band rises to High or Critical; Critical escalates if not acknowledged. */
async function raiseAlertIfNeeded(
  session: ClientSession,
  args: { caseId: Types.ObjectId; interactionId: Types.ObjectId; prev: RiskBand | null; next: RiskBand; reason: string },
  config: ScoringConfig,
  now: Date,
) {
  const { prev, next } = args;
  if (next !== "HIGH" && next !== "CRITICAL") return;
  if (prev && bandRank(prev) >= bandRank(next)) return;
  const escalateAt = next === "CRITICAL" ? new Date(now.getTime() + config.alertPolicy.criticalAckTimeoutSec * 1000) : undefined;
  const alert = await Alert.findOneAndUpdate(
    { caseId: args.caseId, level: next, status: "OPEN" },
    {
      $setOnInsert: { caseId: args.caseId, interactionId: args.interactionId, level: next, status: "OPEN", escalationLevel: 0 },
      $set: { reason: args.reason, ...(escalateAt ? { escalateAt } : {}) },
    },
    { upsert: true, returnDocument: "after", session },
  );
  if (next === "CRITICAL") {
    // The Critical alert replaces a lower open one, so responders see one alert per case.
    await Alert.updateMany(
      { caseId: args.caseId, level: "HIGH", status: "OPEN" },
      { $set: { status: "RESOLVED", resolvedAt: now } },
      { session },
    );
  }
  if (escalateAt && alert) {
    await Job.create(
      [{ type: "alert.escalate", payload: { alertId: ID(alert._id), level: 1 }, runAt: escalateAt }],
      { session },
    );
  }
}

export async function runPipeline(input: RunInput): Promise<RunResult> {
  await db();
  const now = new Date();

  // Pure work outside the transaction: lexicon scan and encryption.
  const text = input.message?.text ?? "";
  const lexicon = text ? lexiconSignals(text) : null;
  const textEnc = text ? encrypt(text) : null;
  const quotesEnc = new Map((lexicon?.indicators ?? []).map((i) => [i.id, encrypt(i.evidence.quote)]));

  const session = await mongoose.startSession();
  let result: RunResult = { messageId: null, showEmergencyPanel: false, replayed: false };
  try {
    await session.withTransaction(
      async () => {
        const interaction = await Interaction.findById(input.interactionId).session(session);
        if (!interaction) throw new ApiError("NOT_FOUND");
        if (interaction.status !== "ACTIVE") throw new ApiError("INTERACTION_ENDED");
        const caseDoc = await Case.findById(interaction.caseId).session(session);
        if (!caseDoc) throw new ApiError("NOT_FOUND");
        const config = await activeConfig(session);
        const flow: FlowState = flowStateOf(interaction.flowState);
        const prevBand = (caseDoc.currentBand ?? null) as RiskBand | null;

        // --- 1. apply the new signal -------------------------------------------------
        let messageId: Types.ObjectId | null = null;
        if (input.message) {
          if (input.message.idempotencyKey) {
            const dup = await Message.findOne({
              interactionId: interaction._id,
              idempotencyKey: input.message.idempotencyKey,
            }).session(session);
            if (dup) {
              result = { messageId: ID(dup._id), showEmergencyPanel: shouldShowEmergency(caseDoc.currentBand), replayed: true };
              return;
            }
          }
          interaction.messageSeq = (interaction.messageSeq ?? 0) + 1;
          const [msg] = await Message.create(
            [
              {
                interactionId: interaction._id,
                seq: interaction.messageSeq,
                sender: "VICTIM",
                modality: "TEXT",
                textEnc: textEnc ?? undefined,
                language: interaction.uiLanguage,
                promptKey: input.message.promptKey,
                idempotencyKey: input.message.idempotencyKey,
              },
            ],
            { session },
          );
          messageId = msg!._id;
          flow.narrativeTurns += 1;
        }
        if (input.skipNarrative) flow.narrativeDone = true;

        if (input.screener) {
          interaction.screenerResponses.push({ ...input.screener, at: now });
          interaction.screenerScores = scoreAll(screenerResponsesOf(interaction)).map((s) => ({ ...s, computedAt: now })) as never;
        }
        if (input.context) {
          interaction.context = { ...(interaction.context ?? {}), ...input.context, updatedAt: now } as never;
          flow.contextDone = true;
        }

        // Mode can change when the context reveals a minor without guardian consent (FR-CON-05).
        const ctx = (interaction.context ?? {}) as CaseContextInput;
        const consents = interaction.consents.map((c) => ({ action: c.action, textAnalysis: c.textAnalysis, voiceAnalysis: c.voiceAnalysis, guardianConsent: c.guardianConsent ?? null }));
        const mode: AssessmentMode = resolveMode(currentConsent(consents), { isMinor: isMinor(ctx) });
        interaction.mode = mode;

        // --- 2. life-safety signals (every mode) ---------------------------------------
        const lexiconActive = (lexicon?.indicators ?? []).filter((i) => !i.negated);
        if (lexiconActive.some((i) => i.dimension === "SUICIDAL_IDEATION")) flow.suicideSignal = true;
        const responses = screenerResponsesOf(interaction);
        const safetyOnlyResponses = responses.filter((r) => r.instrument === "SAFETY_CHECK");

        let newBand: RiskBand | null = prevBand;
        let reason = "";

        if (allowsTextAnalysis(mode) || allowsScreeners(mode)) {
          // --- 3a. full rules-only scoring ---------------------------------------------
          if (lexicon && messageId && allowsTextAnalysis(mode) && lexicon.indicators.length) {
            await Indicator.insertMany(
              lexicon.indicators.map((i) => ({
                interactionId: interaction._id,
                caseId: caseDoc._id,
                dimension: i.dimension,
                source: "SAFETY_LEXICON",
                score: i.score,
                confidence: i.confidence,
                negated: i.negated,
                flags: i.flags ?? [],
                label: i.label,
                evidence: {
                  type: "TEXT_SPAN",
                  messageId,
                  spanStart: i.evidence.start,
                  spanEnd: i.evidence.end,
                  quoteEnc: quotesEnc.get(i.id),
                },
                modelVersion: LEXICON_VERSION,
              })),
              { session },
            );
          }
          const stored = await Indicator.find({ interactionId: interaction._id, status: { $ne: "REJECTED" } })
            .select("dimension source score confidence negated status review flags label")
            .session(session)
            .lean();
          // In SAFETY_ONLY-for-text (VOICE_ONLY) the lexicon still protects life: its flags count, its scores do not.
          const lexiconFlagsOnly: IndicatorInput[] = !allowsTextAnalysis(mode)
            ? lexiconActive.map((i) => ({ ...i, score: 0, confidence: 0 }))
            : [];
          const screener = screenerSignals(allowsScreeners(mode) ? responses : safetyOnlyResponses);
          const context = contextSignals(ctx);
          const facts = [...new Set<CaseFact>([...screener.facts, ...context.facts, ...(allowsTextAnalysis(mode) ? (lexicon?.facts ?? []) : [])])];

          const draft = assess({
            indicators: [...stored.map(toInput), ...lexiconFlagsOnly, ...screener.indicators, ...context.indicators],
            config,
            lockedBand: (caseDoc.overrideLockedBand ?? null) as RiskBand | null,
            limitedConfidence: false,
          });

          interaction.assessmentSeq = (interaction.assessmentSeq ?? 0) + 1;
          const [assessment] = await Assessment.create(
            [
              {
                interactionId: interaction._id,
                caseId: caseDoc._id,
                seq: interaction.assessmentSeq,
                trigger: input.trigger,
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
                modelVersions: { lexicon: LEXICON_VERSION, nlp: null },
              },
            ],
            { session },
          );
          interaction.current = { assessmentId: assessment!._id, svi: draft.svi, band: draft.band, confidence: draft.confidence, at: now } as never;

          caseDoc.currentBand = draft.band;
          caseDoc.bandRank = bandRank(draft.band);
          caseDoc.currentSvi = draft.svi;
          caseDoc.latestAssessmentId = assessment!._id;
          caseDoc.overrideLockedBand = draft.lockedBand ?? undefined;
          caseDoc.limitedConfidence = false;

          const proposals = evaluateRecommendations(
            { band: draft.band, overridesFired: draft.overridesFired, dimensions: draft.dimensions, facts },
            config,
          );
          await persistRecommendations(
            session,
            { caseId: caseDoc._id, interactionId: interaction._id, assessmentId: assessment!._id },
            proposals,
            now,
          );
          newBand = draft.band;
          reason = draft.explanation.en;
          await record(
            {
              actorType: "VICTIM_SESSION",
              actorId: ID(interaction._id),
              action: "assessment.create",
              entityType: "assessment",
              entityId: ID(assessment!._id),
              metadata: { trigger: input.trigger, svi: draft.svi, band: draft.band, configVersion: draft.configVersion },
            },
            session,
          );
        } else {
          // --- 3b. SAFETY_ONLY: overrides from the lexicon and safety check, no SVI ---------
          const flags = new Set<OverrideFlag>([
            ...flagsFrom(lexiconActive),
            ...flagsFrom(screenerSignals(safetyOnlyResponses).indicators),
          ]);
          const locked = (caseDoc.overrideLockedBand ?? null) as RiskBand | null;
          const r = applyOverrides("LOW", flags, config.safetyOverrides, locked);
          if (r.fired.length) {
            newBand = maxBand(prevBand, r.band);
            caseDoc.currentBand = newBand;
            caseDoc.bandRank = bandRank(newBand);
            caseDoc.overrideLockedBand = r.lockedBand ?? undefined;
            const rule = config.safetyOverrides.find((o) => o.id === r.fired[0]);
            reason = `Safety check only (no analysis consent): ${rule?.label.en ?? r.fired[0]} (${r.fired.join(", ")})`;
            await record(
              {
                actorType: "VICTIM_SESSION",
                actorId: ID(interaction._id),
                action: "safety.override",
                entityType: "case",
                entityId: ID(caseDoc._id),
                metadata: { overridesFired: r.fired, band: newBand },
              },
              session,
            );
          }
        }

        // --- 4. alert, case activity, flow state -------------------------------------------
        if (newBand) {
          await raiseAlertIfNeeded(
            session,
            { caseId: caseDoc._id, interactionId: interaction._id, prev: prevBand, next: newBand, reason },
            config,
            now,
          );
        }
        caseDoc.lastActivityAt = now;
        interaction.flowState = flow;
        interaction.markModified("flowState");
        await interaction.save({ session });
        await caseDoc.save({ session });

        result = { messageId: messageId ? ID(messageId) : null, showEmergencyPanel: shouldShowEmergency(newBand), replayed: false };
      },
      { readConcern: { level: "snapshot" }, writeConcern: { w: "majority" } },
    );
  } finally {
    await session.endSession();
  }
  return result;
}
