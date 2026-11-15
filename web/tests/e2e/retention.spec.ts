/** Retention (task 8.7, NFR-PRI-04): purge dates on end; quotes, summaries and notes cleared after retention. */
import { expect, test } from "@playwright/test";
import mongoose from "mongoose";
import { victimSession, withDb } from "./helpers";

test("ending a session starts retention; the purge clears evidence text but keeps the scores", async ({ request }) => {
  const v = await victimSession(request);
  await v.call("/consent", { noticeVersion: "2026-11-v1", language: "en", textAnalysis: true, voiceAnalysis: false, shareWithCounsellor: true, followUpContact: false });
  await v.call("/screeners", { instrument: "SAFETY_CHECK", itemCode: "SAFETY_SAFE_NOW", value: 1 });
  await v.call("/messages", { text: "They said they will burn our house if we do not withdraw the case.", promptKey: "flow.narrative.open" });
  expect((await v.call("/end", { reason: "COMPLETED" })).status()).toBe(200);

  const iid = new mongoose.Types.ObjectId(v.interactionId);
  await withDb(async (db) => {
    const i = await db.collection("interactions").findOne({ _id: iid });
    const days = (i!.retentionUntil.getTime() - i!.endedAt.getTime()) / 86_400_000;
    expect(Math.round(days)).toBe(365);
    const msgs = await db.collection("messages").find({ interactionId: iid }).toArray();
    expect(msgs.length).toBeGreaterThan(0);
    for (const m of msgs) expect(m.purgeAt?.getTime()).toBe(i!.retentionUntil.getTime());
    expect(await db.collection("indicators").countDocuments({ interactionId: iid, "evidence.quoteEnc": { $exists: true } })).toBeGreaterThan(0);

    // Fast-forward past retention and run the purge now.
    await db.collection("interactions").updateOne({ _id: iid }, { $set: { retentionUntil: new Date("2000-01-01T00:00:00Z") } });
    await db.collection("jobs").updateMany({ type: "retention.purge", doneAt: null }, { $set: { runAt: new Date("2000-01-01T00:00:00Z") } });
    const pending = await db.collection("jobs").countDocuments({ type: "retention.purge", doneAt: null });
    if (!pending) await db.collection("jobs").insertOne({ type: "retention.purge", payload: {}, runAt: new Date("2000-01-01T00:00:00Z"), attempts: 0, doneAt: null, lockedUntil: null });
  });

  const run = await request.post("/api/v1/internal/jobs/run", { headers: { "x-jobs-secret": process.env.JOBS_SECRET! } });
  expect(run.status()).toBe(200);

  await withDb(async (db) => {
    const i = await db.collection("interactions").findOne({ _id: iid });
    expect(i!.contentPurgedAt).toBeInstanceOf(Date);
    expect(await db.collection("indicators").countDocuments({ interactionId: iid, "evidence.quoteEnc": { $exists: true } })).toBe(0);
    // The indicators and assessments themselves stay for the score history.
    expect(await db.collection("indicators").countDocuments({ interactionId: iid })).toBeGreaterThan(0);
    expect(await db.collection("assessments").countDocuments({ interactionId: iid })).toBeGreaterThan(0);
    // The next daily run is scheduled.
    expect(await db.collection("jobs").countDocuments({ type: "retention.purge", doneAt: null, runAt: { $gt: new Date() } })).toBeGreaterThan(0);
  });
});
