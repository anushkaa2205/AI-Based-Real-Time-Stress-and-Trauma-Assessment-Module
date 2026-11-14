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
 * Pipeline v2 (task 4.8): the AI runs on redacted text as a second, independent path;
 * if it fails the turn is scored by rules only, marked limited confidence and a
 * `rescore` job is queued. Real-time events after commit arrive in Phase 5.
 * Logs never contain victim text (rule 9).
 */
import { randomUUID } from "node:crypto";
import mongoose, { type ClientSession, Types } from "mongoose";
import { TEXT_TIMEOUT_MS, analyzeText, defaultDeps } from "@/core/analysis-client/client";
import { checkAnalysis, type CheckedAnalysis } from "@/core/analysis-client/guardrails";
import { record } from "@/core/audit/record";
import { allowsScreeners, allowsTextAnalysis, currentConsent, resolveMode } from "@/core/consent/mode";
import { flowStateOf, type FlowState } from "@/core/conversation/flow";
import { encrypt } from "@/core/privacy/crypto";
import { redact } from "@/core/privacy/redact";
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

/** What the route needs to pick the next prompt, so it does not read the database again. */
export interface TurnFacts {
  consentGiven: boolean;
  mode: AssessmentMode;
  answered: Map<string, number | null>;
  state: FlowState;
  lang: "en" | "hi";
}

export interface RunResult {
  messageId: string | null;
  showEmergencyPanel: boolean;
  replayed: boolean;
  /** null only for an idempotent replay */
  turn: TurnFacts | null;
}

function answeredOf(responses: ScreenerResponseInput[]): Map<string, number | null> {
  const m = new Map<string, number | null>();
  for (const r of responses) m.set(r.itemCode, r.skipped || r.value === null ? null : r.value);
  return m;
}

const isDuplicateIdempotencyKey = (err: unknown) => {
  const e = err as { code?: number; keyPattern?: Record<string, unknown> };
  return e?.code === 11000 && !!e.keyPattern && "idempotencyKey" in e.keyPattern;
};

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
  })
    .select("ruleId type status urgency")
    .session(session)
    .lean();

  // Collect every change, then write them in ONE round trip.
  const supersede = new Set<string>();
  const inserts: Record<string, unknown>[] = [];
  const wanted = new Set(proposals.map((p) => p.ruleId));
  for (const rec of open) {
    // Stale proposals, and the automatic Low-band information once the band has risen.
    // Auto-triggered emergency support stays until a human reviews it (FR-REC-05).
    const staleInfo = rec.status === "AUTO_TRIGGERED" && rec.type === "INFORMATION";
    if ((rec.status === "PROPOSED" || staleInfo) && !wanted.has(rec.ruleId)) supersede.add(ID(rec._id));
  }
  for (const p of proposals) {
    const existing = open.find((r) => r.ruleId === p.ruleId && !supersede.has(ID(r._id)));
    if (existing && (existing.status !== "PROPOSED" || existing.urgency === p.urgency)) continue;
    if (existing) supersede.add(ID(existing._id));
    inserts.push({
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
      updateOne: { filter: { _id: new Types.ObjectId(id) }, update: { $set: { status: "SUPERSEDED", updatedAt: now } } },
    })),
    ...inserts.map((doc) => ({ insertOne: { document: { ...doc, createdAt: now, updatedAt: now } } })),
  ];
  if (ops.length) await Recommendation.bulkWrite(ops as never, { session, ordered: true });
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

/** Whole-turn budget for the AI call, measured from the start of the pipeline. */
const AI_BUDGET_MS = 2_300;
const MIN_AI_MS = 1_000;

export async function runPipeline(input: RunInput): Promise<RunResult> {
  const startedMs = Date.now();
  await db();
  const now = new Date();

  // Work outside the transaction: lexicon scan, AI call on REDACTED text, encryption.
  const text = input.message?.text ?? "";
  const lexicon = text ? lexiconSignals(text) : null;
  const textEnc = text ? encrypt(text) : null;
  const quotesEnc = new Map((lexicon?.indicators ?? []).map((i) => [i.id, encrypt(i.evidence.quote)]));

  // One parallel round trip before the transaction: checks, duplicate detection, scoring config.
  const [pre, existing, config] = await Promise.all([
    Interaction.findById(input.interactionId).select("mode uiLanguage context status consents.action").lean(),
    input.message?.idempotencyKey
      ? Message.findOne({ interactionId: input.interactionId, idempotencyKey: input.message.idempotencyKey }).select("_id").lean()
      : Promise.resolve(null),
    activeConfig(),
  ]);
  if (!pre) throw new ApiError("NOT_FOUND");
  if (pre.status !== "ACTIVE") throw new ApiError("INTERACTION_ENDED");
  // Consent step first, even "no to everything", so nothing is processed before the notice (AC-CON-01).
  if (!pre.consents?.length) throw new ApiError("CONSENT_REQUIRED", "Please answer the consent question first.");
  if (input.screener && input.screener.instrument !== "SAFETY_CHECK" && !allowsScreeners(pre.mode)) {
    throw new ApiError("CONSENT_REQUIRED", "This question needs your consent.");
  }
  if (existing) return replayOf(input.interactionId, ID(existing._id));

  // Second, independent path (task 4.8): the AI. Its failure never blocks the turn (NFR-REL-01).
  let ai: { checked: CheckedAnalysis; quotesEnc: Map<string, string>; translationEnc: string | null } | null = null;
  let aiDegraded = false;
  if (text) {
    if (allowsTextAnalysis(pre.mode)) {
      const ctx = (pre.context ?? {}) as CaseContextInput;
      const redacted = redact(text).text; // NFR-SEC-05: no phones, e-mails, IDs or PIN codes leave the app
      // Time budget (NFR-PERF-01, 3 s p95): the AI gets what is left of AI_BUDGET_MS after the
      // work above, never more than the 2.5 s cap; the transaction needs ~0.6 s after it.
      const timeoutMs = Math.min(TEXT_TIMEOUT_MS, Math.max(MIN_AI_MS, AI_BUDGET_MS - (Date.now() - startedMs)));
      const r = await analyzeText(
        {
          requestId: input.message?.idempotencyKey ?? randomUUID(),
          text: redacted,
          languageHint: pre.uiLanguage,
          context: { isSexualOffence: ctx.isSexualOffence === true, isMinor: isMinor(ctx) },
        },
        { ...defaultDeps(), timeoutMs },
      );
      if (r.degraded) {
        aiDegraded = true;
        console.warn(`[pipeline] analysis degraded (${r.reason}); continuing with rules only`);
      } else {
        const checked = checkAnalysis(r.result, text, redacted);
        ai = {
          checked,
          quotesEnc: new Map(checked.indicators.map((i) => [i.id!, encrypt(i.evidence.quote)])),
          translationEnc: checked.translationEn ? encrypt(checked.translationEn) : null,
        };
      }
    }
  }

  const session = await mongoose.startSession();
  let result: RunResult = { messageId: null, showEmergencyPanel: false, replayed: false, turn: null };
  try {
    await session.withTransaction(
      async () => {
        const interaction = await Interaction.findById(input.interactionId).session(session);
        if (!interaction) throw new ApiError("NOT_FOUND");
        if (interaction.status !== "ACTIVE") throw new ApiError("INTERACTION_ENDED");
        const caseDoc = await Case.findById(interaction.caseId).session(session);
        if (!caseDoc) throw new ApiError("NOT_FOUND");
        const flow: FlowState = flowStateOf(interaction.flowState);
        const prevBand = (caseDoc.currentBand ?? null) as RiskBand | null;

        // --- 1. apply the new signal -------------------------------------------------
        // A concurrent retry with the same Idempotency-Key fails on the unique index → replay below.
        let messageId: Types.ObjectId | null = null;
        if (input.message) {
          interaction.messageSeq = (interaction.messageSeq ?? 0) + 1;
          const [msg] = await Message.create(
            [
              {
                interactionId: interaction._id,
                seq: interaction.messageSeq,
                sender: "VICTIM",
                modality: "TEXT",
                textEnc: textEnc ?? undefined,
                translationEnc: ai?.translationEnc ?? undefined,
                language: ai?.checked.language ?? interaction.uiLanguage,
                emotion: ai ? ai.checked.emotion : undefined,
                promptKey: input.message.promptKey,
                idempotencyKey: input.message.idempotencyKey,
              },
            ],
            { session },
          );
          messageId = msg!._id;
          flow.narrativeTurns += 1;
          if (ai && !interaction.detectedLanguages.includes(ai.checked.language)) {
            interaction.detectedLanguages.push(ai.checked.language);
          }
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
          const newIndicators: Record<string, unknown>[] = [];
          if (lexicon && messageId && allowsTextAnalysis(mode)) {
            newIndicators.push(
              ...lexicon.indicators.map((i) => ({
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
            );
          }
          // AI indicators: only if consent still allows text analysis at write time (ARCHITECTURE §6.5).
          if (ai && messageId && allowsTextAnalysis(mode)) {
            newIndicators.push(
              ...ai.checked.indicators.map((i) => ({
                interactionId: interaction._id,
                caseId: caseDoc._id,
                dimension: i.dimension,
                source: "TEXT_NLP",
                score: i.score,
                confidence: i.confidence,
                negated: i.negated ?? false,
                flags: i.flags ?? [],
                label: i.rationale || undefined,
                evidence: {
                  type: "TEXT_SPAN",
                  messageId,
                  spanStart: i.evidence.start,
                  spanEnd: i.evidence.end,
                  quoteEnc: ai!.quotesEnc.get(i.id!),
                },
                modelVersion: ai!.checked.modelVersion,
              })),
            );
          }
          if (newIndicators.length) await Indicator.insertMany(newIndicators, { session });
          // NFR-REL-01: limited confidence while any message still waits for AI analysis.
          // The case flag stays set until the rescore job (task 5.7) clears it.
          if (aiDegraded && messageId) {
            await Job.create(
              [{ type: "rescore", payload: { interactionId: ID(interaction._id), messageId: ID(messageId) }, runAt: new Date(now.getTime() + 60_000) }],
              { session },
            );
          }
          const limitedConfidence = aiDegraded || caseDoc.limitedConfidence === true;
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
            limitedConfidence,
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
                modelVersions: { lexicon: LEXICON_VERSION, nlp: ai?.checked.modelVersion ?? null },
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
          caseDoc.limitedConfidence = limitedConfidence;

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

        result = {
          messageId: messageId ? ID(messageId) : null,
          showEmergencyPanel: shouldShowEmergency(newBand),
          replayed: false,
          turn: {
            consentGiven: interaction.consents.length > 0,
            mode,
            answered: answeredOf(responses),
            state: flow,
            lang: interaction.uiLanguage === "hi" ? "hi" : "en",
          },
        };
      },
      { readConcern: { level: "snapshot" }, writeConcern: { w: "majority" } },
    );
  } catch (err) {
    // Two copies of the same message raced past the pre-check: the second is a replay.
    if (input.message?.idempotencyKey && isDuplicateIdempotencyKey(err)) {
      const dup = await Message.findOne({ interactionId: input.interactionId, idempotencyKey: input.message.idempotencyKey })
        .select("_id")
        .lean();
      if (dup) return replayOf(input.interactionId, ID(dup._id));
    }
    throw err;
  } finally {
    await session.endSession();
  }
  return result;
}

/** Idempotent replay (API_CONTRACTS §1): the original message id and the current state. */
async function replayOf(interactionId: string, messageId: string): Promise<RunResult> {
  const interaction = await Interaction.findById(interactionId).select("caseId").lean();
  const caseDoc = interaction ? await Case.findById(interaction.caseId).select("currentBand").lean() : null;
  return { messageId, showEmergencyPanel: shouldShowEmergency(caseDoc?.currentBand), replayed: true, turn: null };
}
