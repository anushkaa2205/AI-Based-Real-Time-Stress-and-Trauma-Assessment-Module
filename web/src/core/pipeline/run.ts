/**
 * Assessment pipeline (tasks 3.5, 4.8, 5.1; ARCHITECTURE §5, DATABASE §6).
 *
 *   consent check → store message (encrypted) → safety lexicon + AI (redacted text) →
 *   indicators → score (fuse → SVI → band → overrides) → assessment → case rank →
 *   recommendations → alert → real-time events after commit
 *
 * Everything for one turn is written in ONE MongoDB transaction. The safety
 * lexicon runs on every message in every mode (CLAUDE.md rules 4/6). The AI is a
 * second, independent path; if it fails the turn is scored by rules only, marked
 * limited confidence and a `rescore` job is queued (NFR-REL-01).
 * Logs never contain victim text (rule 9).
 */
import { randomUUID } from "node:crypto";
import mongoose, { type Types } from "mongoose";
import { TEXT_TIMEOUT_MS, analyzeText, defaultDeps } from "@/core/analysis-client/client";
import { checkAnalysis, type CheckedAnalysis } from "@/core/analysis-client/guardrails";
import { allowsScreeners, allowsTextAnalysis, currentConsent, resolveMode } from "@/core/consent/mode";
import { flowStateOf, type FlowState } from "@/core/conversation/flow";
import { encrypt } from "@/core/privacy/crypto";
import { redact } from "@/core/privacy/redact";
import { LEXICON_VERSION, lexiconSignals } from "@/core/safety-lexicon/engine";
import { activeConfig } from "@/core/scoring/activeConfig";
import { isMinor, type CaseContextInput } from "@/core/scoring/context";
import { scoreAll, type ScreenerResponseInput } from "@/core/screeners/score";
import { shouldShowEmergency } from "@/core/victim/emergency";
import { db } from "@/lib/db";
import { ApiError } from "@/lib/problem";
import { interactionChannel, type OutboundEvent } from "@/lib/realtime/channels";
import { publish } from "@/lib/realtime/publish";
import { Case, Indicator, Interaction, Job, Message, type AssessmentMode } from "@/models";
import { scoreInteraction, screenerResponsesOf, type Trigger } from "./score";

export type { Trigger };

export interface RunInput {
  interactionId: string;
  trigger: "TEXT_MESSAGE" | "SCREENER" | "CONTEXT_UPDATE";
  message?: { text: string; promptKey?: string; idempotencyKey?: string };
  screener?: ScreenerResponseInput;
  context?: CaseContextInput;
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

const ID = (v: unknown) => String(v);

function answeredOf(responses: ScreenerResponseInput[]): Map<string, number | null> {
  const m = new Map<string, number | null>();
  for (const r of responses) m.set(r.itemCode, r.skipped || r.value === null ? null : r.value);
  return m;
}

const isDuplicateIdempotencyKey = (err: unknown) => {
  const e = err as { code?: number; keyPattern?: Record<string, unknown> };
  return e?.code === 11000 && !!e.keyPattern && "idempotencyKey" in e.keyPattern;
};

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
  if (text && allowsTextAnalysis(pre.mode)) {
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

  const session = await mongoose.startSession();
  let result: RunResult = { messageId: null, showEmergencyPanel: false, replayed: false, turn: null };
  let events: OutboundEvent[] = [];
  try {
    await session.withTransaction(
      async () => {
        const interaction = await Interaction.findById(input.interactionId).session(session);
        if (!interaction) throw new ApiError("NOT_FOUND");
        if (interaction.status !== "ACTIVE") throw new ApiError("INTERACTION_ENDED");
        const caseDoc = await Case.findById(interaction.caseId).session(session);
        if (!caseDoc) throw new ApiError("NOT_FOUND");
        const flow: FlowState = flowStateOf(interaction.flowState);
        const turnEvents: OutboundEvent[] = [];

        // --- 1. apply the new signal -------------------------------------------------
        // A concurrent retry with the same Idempotency-Key fails on the unique index → replay below.
        let messageId: Types.ObjectId | null = null;
        if (input.message) {
          interaction.messageSeq = (interaction.messageSeq ?? 0) + 1;
          const language = ai?.checked.language ?? interaction.uiLanguage;
          const [msg] = await Message.create(
            [
              {
                interactionId: interaction._id,
                seq: interaction.messageSeq,
                sender: "VICTIM",
                modality: "TEXT",
                textEnc: textEnc ?? undefined,
                translationEnc: ai?.translationEnc ?? undefined,
                language,
                emotion: ai ? ai.checked.emotion : undefined,
                promptKey: input.message.promptKey,
                idempotencyKey: input.message.idempotencyKey,
              },
            ],
            { session },
          );
          messageId = msg!._id;
          flow.narrativeTurns += 1;
          if (ai && !interaction.detectedLanguages.includes(ai.checked.language)) interaction.detectedLanguages.push(ai.checked.language);
          // Ids only: the text is fetched over our own API (privacy, see lib/realtime/channels.ts).
          turnEvents.push({
            channel: interactionChannel(ID(interaction._id)),
            event: "transcript.appended",
            data: { interactionId: ID(interaction._id), messageId: ID(messageId), seq: interaction.messageSeq, sender: "VICTIM", language },
          });
        }

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
        const consents = interaction.consents.map((c) => ({
          action: c.action,
          textAnalysis: c.textAnalysis,
          voiceAnalysis: c.voiceAnalysis,
          guardianConsent: c.guardianConsent ?? null,
        }));
        const mode: AssessmentMode = resolveMode(currentConsent(consents), { isMinor: isMinor(ctx) });
        interaction.mode = mode;

        // --- 2. store this turn's indicators and facts (consent re-checked at write time) ---
        const lexiconActive = (lexicon?.indicators ?? []).filter((i) => !i.negated);
        if (lexiconActive.some((i) => i.dimension === "SUICIDAL_IDEATION")) flow.suicideSignal = true;
        if (messageId && allowsTextAnalysis(mode)) {
          const newIndicators: Record<string, unknown>[] = [];
          for (const i of lexicon?.indicators ?? []) {
            newIndicators.push({
              interactionId: interaction._id,
              caseId: caseDoc._id,
              dimension: i.dimension,
              source: "SAFETY_LEXICON",
              score: i.score,
              confidence: i.confidence,
              negated: i.negated,
              flags: i.flags ?? [],
              label: i.label,
              evidence: { type: "TEXT_SPAN", messageId, spanStart: i.evidence.start, spanEnd: i.evidence.end, quoteEnc: quotesEnc.get(i.id) },
              modelVersion: LEXICON_VERSION,
            });
          }
          for (const i of ai?.checked.indicators ?? []) {
            newIndicators.push({
              interactionId: interaction._id,
              caseId: caseDoc._id,
              dimension: i.dimension,
              source: "TEXT_NLP",
              score: i.score,
              confidence: i.confidence,
              negated: i.negated ?? false,
              flags: i.flags ?? [],
              label: i.rationale || undefined,
              evidence: { type: "TEXT_SPAN", messageId, spanStart: i.evidence.start, spanEnd: i.evidence.end, quoteEnc: ai!.quotesEnc.get(i.id!) },
              modelVersion: ai!.checked.modelVersion,
            });
          }
          if (newIndicators.length) await Indicator.insertMany(newIndicators, { session });
          for (const f of lexicon?.facts ?? []) if (!interaction.caseFacts.includes(f)) interaction.caseFacts.push(f);
          if (aiDegraded) {
            await Job.create(
              [{ type: "rescore", payload: { interactionId: ID(interaction._id), messageId: ID(messageId) }, runAt: new Date(now.getTime() + 60_000) }],
              { session },
            );
          }
        }

        // --- 3. score, recommend, alert -----------------------------------------------------
        const scored = await scoreInteraction(session, interaction, caseDoc, {
          trigger: input.trigger,
          now,
          config,
          actor: { type: "VICTIM_SESSION", id: ID(interaction._id) },
          lexiconActive,
          nlpVersion: ai?.checked.modelVersion ?? null,
          aiDegraded: aiDegraded && !!messageId && allowsTextAnalysis(mode),
        });

        caseDoc.lastActivityAt = now;
        interaction.flowState = flow;
        interaction.markModified("flowState");
        await interaction.save({ session });
        await caseDoc.save({ session });

        events = [...turnEvents, ...scored.events];
        result = {
          messageId: messageId ? ID(messageId) : null,
          showEmergencyPanel: shouldShowEmergency(scored.band),
          replayed: false,
          turn: {
            consentGiven: interaction.consents.length > 0,
            mode,
            answered: answeredOf(screenerResponsesOf(interaction)),
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
  await publish(events); // after commit only (DATABASE §6)
  return result;
}

/** Idempotent replay (API_CONTRACTS §1): the original message id and the current state. */
async function replayOf(interactionId: string, messageId: string): Promise<RunResult> {
  const interaction = await Interaction.findById(interactionId).select("caseId").lean();
  const caseDoc = interaction ? await Case.findById(interaction.caseId).select("currentBand").lean() : null;
  return { messageId, showEmergencyPanel: shouldShowEmergency(caseDoc?.currentBand), replayed: true, turn: null };
}
