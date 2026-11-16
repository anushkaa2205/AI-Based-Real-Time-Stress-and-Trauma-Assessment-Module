/**
 * Retention (task 8.7, NFR-PRI-04, DATABASE §8.3).
 *
 * - When an interaction ends, its messages and voice windows get `purgeAt = endedAt + retention`
 *   (TTL indexes delete them), and the interaction gets `retentionUntil`.
 * - A daily `retention.purge` job clears what has no TTL: indicator evidence quotes, case summaries
 *   (once every interaction of the case is past retention) and note text. Indicators, assessments,
 *   alerts and referrals stay: they hold no free text from the victim.
 * - Sessions left open (no "end" call) are closed as ABANDONED once their token has expired, so
 *   their retention clock starts too.
 * - Stored audio (only with consent; not built, see task 7.9) is deleted after `deleteAfter`.
 */
import mongoose from "mongoose";
import { db } from "@/lib/db";
import { Case, CaseNote, Indicator, Interaction, Job, Message, StoredAudio, VoiceWindow } from "@/models";

export const RETENTION_DAYS = 365;
const DAY_MS = 86_400_000;
export const PURGE_EVERY_MS = DAY_MS;
const BATCH = 500;
/** An interaction a calling system left open with no activity for this long is closed as ABANDONED (timeout). */
export const STALE_AFTER_MS = DAY_MS;

/** Pure: when content of an interaction that ended at `endedAt` must go. */
export function retentionUntil(endedAt: Date, days = RETENTION_DAYS): Date {
  return new Date(endedAt.getTime() + days * DAY_MS);
}

/** Sets the purge dates for one ended interaction (idempotent). */
export async function startRetention(id: unknown, endedAt: Date): Promise<void> {
  const until = retentionUntil(endedAt);
  const interactionId = new mongoose.Types.ObjectId(String(id));
  await Promise.all([
    Interaction.updateOne({ _id: interactionId }, { $set: { retentionUntil: until } }),
    Message.updateMany({ interactionId }, { $set: { purgeAt: until } }),
    VoiceWindow.updateMany({ interactionId }, { $set: { purgeAt: until } }),
  ]);
}

export interface PurgeResult {
  closedAbandoned: number;
  interactionsPurged: number;
  quotesCleared: number;
  summariesCleared: number;
  notesCleared: number;
  audioDeleted: number;
}

export async function purgeDue(now: Date = new Date()): Promise<PurgeResult> {
  await db();
  const r: PurgeResult = { closedAbandoned: 0, interactionsPurged: 0, quotesCleared: 0, summariesCleared: 0, notesCleared: 0, audioDeleted: 0 };

  // 1. Interactions a calling system never ended (no activity for STALE_AFTER_MS): close them so
  //    their retention starts. There are no victim sessions any more (task M.2).
  const stale = await Interaction.find({ status: "ACTIVE", updatedAt: { $lt: new Date(now.getTime() - STALE_AFTER_MS) } })
    .select("_id updatedAt")
    .limit(BATCH)
    .lean();
  for (const i of stale) {
    const endedAt = i.updatedAt ? new Date(new Date(i.updatedAt).getTime() + STALE_AFTER_MS) : now;
    // Voice fingerprints (M.10) are biometric: they go when the interaction closes.
    const res = await Interaction.updateOne({ _id: i._id, status: "ACTIVE" }, { $set: { status: "ABANDONED", endedAt }, $unset: { speakerStateEnc: "" } });
    if (res.modifiedCount) {
      r.closedAbandoned += 1;
      await startRetention(i._id, endedAt);
    }
  }
  // Ended interactions from before task 8.7 have no retention date yet.
  const undated = await Interaction.find({ status: { $ne: "ACTIVE" }, retentionUntil: null })
    .select("_id endedAt startedAt")
    .limit(BATCH)
    .lean();
  for (const i of undated) await startRetention(i._id, new Date(i.endedAt ?? i.startedAt));

  // 2. Interactions past retention: clear evidence quotes (TTL already removes messages).
  const due = await Interaction.find({ retentionUntil: { $lt: now }, contentPurgedAt: null })
    .select("_id caseId")
    .limit(BATCH)
    .lean();
  if (due.length) {
    const ids = due.map((i) => i._id);
    const q = await Indicator.updateMany({ interactionId: { $in: ids }, "evidence.quoteEnc": { $exists: true } }, { $unset: { "evidence.quoteEnc": "" } });
    r.quotesCleared = q.modifiedCount;
    await Interaction.updateMany({ _id: { $in: ids } }, { $set: { contentPurgedAt: now } });
    r.interactionsPurged = ids.length;

    // 3. Cases whose every interaction is past retention: clear the summary and note text.
    const caseIds = [...new Set(due.map((i) => String(i.caseId)))];
    for (const caseId of caseIds) {
      const stillKept = await Interaction.exists({ caseId, $or: [{ retentionUntil: null }, { retentionUntil: { $gte: now } }] });
      if (stillKept) continue;
      const s = await Case.updateOne({ _id: caseId, $or: [{ summaryEnc: { $exists: true } }, { summaryTranslatedEnc: { $exists: true } }] }, { $unset: { summaryEnc: "", summaryTranslatedEnc: "" } });
      r.summariesCleared += s.modifiedCount;
      const n = await CaseNote.updateMany({ caseId, bodyEnc: { $ne: null } }, { $set: { bodyEnc: null, purgedAt: now } });
      r.notesCleared += n.modifiedCount;
    }
  }

  // 4. Consented audio past its date (none exists while task 7.9 is not built).
  const audio = await StoredAudio.deleteMany({ deleteAfter: { $lt: now } });
  r.audioDeleted = audio.deletedCount ?? 0;
  return r;
}

/** Job handler: purge, then schedule tomorrow's run. */
export async function runPurge(now: Date): Promise<PurgeResult> {
  const r = await purgeDue(now);
  await Job.create({ type: "retention.purge", payload: {}, runAt: new Date(now.getTime() + PURGE_EVERY_MS) });
  return r;
}
