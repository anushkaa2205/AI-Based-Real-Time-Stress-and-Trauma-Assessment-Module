/**
 * Job runner (task 5.7, ARCHITECTURE §10.2, ADR-7). No separate worker:
 * `runDue()` claims up to 5 due jobs atomically and runs them. It is called
 * after GET /staff/alerts (every open staff screen polls it every 10 s), from
 * POST /api/v1/internal/jobs/run, and in a loop by `npm run jobs` locally.
 * Concurrent callers never run the same job twice (lockedUntil claim).
 */
import mongoose from "mongoose";
import { randomUUID } from "node:crypto";
import { analyzeText, defaultDeps } from "@/core/analysis-client/client";
import { checkAnalysis } from "@/core/analysis-client/guardrails";
import { record } from "@/core/audit/record";
import { allowsTextAnalysis } from "@/core/consent/mode";
import { remindFollowUp } from "@/core/followups/service";
import { scoreInteraction } from "@/core/pipeline/score";
import { decrypt, encrypt } from "@/core/privacy/crypto";
import { redact } from "@/core/privacy/redact";
import { activeConfig } from "@/core/scoring/activeConfig";
import { isMinor, type CaseContextInput } from "@/core/scoring/context";
import { db } from "@/lib/db";
import { SUPERVISORS, roleChannel, type OutboundEvent } from "@/lib/realtime/channels";
import { publish } from "@/lib/realtime/publish";
import { Alert, Case, Indicator, Interaction, Job, Message } from "@/models";

const LOCK_MS = 60_000;
const MAX_ATTEMPTS = 6;
const DONE_TTL_MS = 7 * 24 * 3_600_000;
const ID = (v: unknown) => String(v);

type Outcome = { done: true; events?: OutboundEvent[] } | { done: false; retryAt: Date; error: string };

/** Exponential back-off for retries: 1, 2, 4, 8… minutes, capped at 30. */
export function backoff(attempts: number, nowMs: number): Date {
  return new Date(nowMs + Math.min(30, 2 ** Math.max(0, attempts - 1)) * 60_000);
}

/** Who gets an escalated alert at each level (FR-ALR-03): 1 = supervisors, 2 = district officers. */
export function escalationChannel(level: number, districtId: string | null): string | null {
  if (level === 1) return SUPERVISORS;
  if (level === 2 && districtId) return roleChannel("DISTRICT_OFFICER", districtId);
  return null;
}

async function escalate(payload: { alertId?: string; level?: number }, now: Date): Promise<Outcome> {
  const config = await activeConfig();
  const maxLevel = Math.max(0, config.alertPolicy.escalationChain.length - 1);
  const level = Math.min(maxLevel, Number(payload.level ?? 1));
  const alert = await Alert.findById(payload.alertId);
  if (!alert || alert.status !== "OPEN" || alert.escalationLevel >= level) return { done: true };
  const caseDoc = await Case.findById(alert.caseId).select("docketNumber districtId").lean();
  alert.escalationLevel = level;
  const nextAt = level < maxLevel ? new Date(now.getTime() + config.alertPolicy.criticalAckTimeoutSec * 1000) : undefined;
  alert.escalateAt = nextAt;
  await alert.save();
  if (nextAt) await Job.create({ type: "alert.escalate", payload: { alertId: ID(alert._id), level: level + 1 }, runAt: nextAt });
  await record({
    actorType: "SYSTEM",
    action: "alert.escalate",
    entityType: "alert",
    entityId: ID(alert._id),
    metadata: { escalationLevel: level },
  });
  const channel = escalationChannel(level, caseDoc?.districtId ? ID(caseDoc.districtId) : null);
  const events: OutboundEvent[] = channel
    ? [
        {
          channel,
          event: "alert.escalated",
          data: {
            alertId: ID(alert._id),
            caseId: ID(alert.caseId),
            docketNumber: caseDoc?.docketNumber ?? "",
            level: alert.level,
            escalationLevel: level,
            waitingSec: Math.round((now.getTime() - new Date(alert.createdAt ?? now).getTime()) / 1000),
          },
        },
      ]
    : [];
  return { done: true, events };
}

async function rescore(jobId: string, payload: { interactionId?: string; messageId?: string }, attempts: number, now: Date): Promise<Outcome> {
  const [interaction, message] = await Promise.all([
    Interaction.findById(payload.interactionId).select("mode uiLanguage context").lean(),
    Message.findById(payload.messageId).select("textEnc interactionId").lean(),
  ]);
  if (!interaction || !message) return { done: true };
  if (!allowsTextAnalysis(interaction.mode)) return { done: true }; // consent withdrawn since: never analyse

  const already = await Indicator.exists({ "evidence.messageId": message._id, source: "TEXT_NLP" });
  let ai: ReturnType<typeof checkAnalysis> | null = null;
  if (!already) {
    const text = decrypt(message.textEnc);
    const redacted = redact(text).text;
    const ctx = (interaction.context ?? {}) as CaseContextInput;
    const r = await analyzeText(
      { requestId: randomUUID(), text: redacted, languageHint: interaction.uiLanguage, context: { isSexualOffence: ctx.isSexualOffence === true, isMinor: isMinor(ctx) } },
      { ...defaultDeps(), timeoutMs: 20_000 },
    );
    if (r.degraded) {
      return attempts >= MAX_ATTEMPTS ? { done: true } : { done: false, retryAt: backoff(attempts, now.getTime()), error: r.reason };
    }
    ai = checkAnalysis(r.result, text, redacted);
  }

  const config = await activeConfig();
  let events: OutboundEvent[] = [];
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const doc = await Interaction.findById(payload.interactionId).session(session);
      if (!doc || !allowsTextAnalysis(doc.mode)) return;
      const caseDoc = await Case.findById(doc.caseId).session(session);
      if (!caseDoc) return;
      if (ai) {
        await Message.updateOne(
          { _id: message._id },
          { $set: { translationEnc: ai.translationEn ? encrypt(ai.translationEn) : undefined, language: ai.language, emotion: ai.emotion } },
          { session },
        );
        if (ai.indicators.length) {
          await Indicator.insertMany(
            ai.indicators.map((i) => ({
              interactionId: doc._id,
              caseId: caseDoc._id,
              dimension: i.dimension,
              source: "TEXT_NLP",
              score: i.score,
              confidence: i.confidence,
              negated: i.negated ?? false,
              flags: i.flags ?? [],
              label: i.rationale || undefined,
              evidence: { type: "TEXT_SPAN", messageId: message._id, spanStart: i.evidence.start, spanEnd: i.evidence.end, quoteEnc: encrypt(i.evidence.quote) },
              modelVersion: ai!.modelVersion,
            })),
            { session },
          );
        }
      }
      // Limited confidence ends when no other message of this interaction is still waiting.
      const othersPending = await Job.exists({ _id: { $ne: jobId }, type: "rescore", "payload.interactionId": ID(doc._id), doneAt: null }).session(session);
      const scored = await scoreInteraction(session, doc, caseDoc, {
        trigger: "TEXT_MESSAGE",
        now,
        config,
        actor: { type: "SYSTEM", id: "rescore" },
        nlpVersion: ai?.modelVersion ?? null,
        limitedConfidence: !!othersPending,
      });
      await doc.save({ session });
      await caseDoc.save({ session });
      events = scored.events;
    });
  } finally {
    await session.endSession();
  }
  return { done: true, events };
}

/** Claims and runs up to `limit` due jobs. Never throws; returns how many ran. */
export async function runDue(limit = 5, now: Date = new Date()): Promise<{ ran: number; failed: number }> {
  await db();
  let ran = 0;
  let failed = 0;
  for (let i = 0; i < limit; i++) {
    const job = await Job.findOneAndUpdate(
      {
        type: { $in: ["alert.escalate", "rescore", "followup.remind"] }, // retention.purge and stats.rollup arrive in Phases 8–9
        doneAt: null,
        runAt: { $lte: now },
        $or: [{ lockedUntil: null }, { lockedUntil: { $lt: now } }],
      },
      { $set: { lockedUntil: new Date(now.getTime() + LOCK_MS) }, $inc: { attempts: 1 } },
      { sort: { runAt: 1 }, returnDocument: "after" },
    ).lean();
    if (!job) break;
    let outcome: Outcome;
    try {
      const payload = (job.payload ?? {}) as Record<string, unknown>;
      outcome =
        job.type === "alert.escalate"
          ? await escalate(payload as { alertId?: string; level?: number }, now)
          : job.type === "followup.remind"
            ? await remindFollowUp(payload as { followUpId?: string; stage?: "due" | "miss" }, now)
            : await rescore(ID(job._id), payload as { interactionId?: string; messageId?: string }, job.attempts, now);
    } catch (err) {
      const name = (err as Error)?.name ?? "Error";
      outcome = job.attempts >= MAX_ATTEMPTS ? { done: true } : { done: false, retryAt: backoff(job.attempts, now.getTime()), error: name };
      console.error(`[jobs] ${job.type} failed: ${name}`);
    }
    if (outcome.done) {
      await Job.updateOne({ _id: job._id }, { $set: { doneAt: new Date(), lockedUntil: null, cleanupAt: new Date(now.getTime() + DONE_TTL_MS) } });
      if (outcome.events?.length) await publish(outcome.events);
      ran++;
    } else {
      await Job.updateOne({ _id: job._id }, { $set: { runAt: outcome.retryAt, lockedUntil: null, lastError: outcome.error } });
      failed++;
    }
  }
  return { ran, failed };
}
