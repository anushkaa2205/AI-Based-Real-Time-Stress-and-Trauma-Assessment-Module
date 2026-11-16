/** Retention (task 8.7, NFR-PRI-04): purge dates on end; quotes, summaries and notes cleared after retention. */
import { expect, test } from "@playwright/test";
import mongoose from "mongoose";
import { dropIntegrationKeys, integrationSession, withDb } from "./helpers";

test.afterAll(dropIntegrationKeys);

test("ending an interaction starts retention; the purge clears evidence text but keeps the scores", async ({ request }) => {
  const v = await integrationSession(request);
  await v.say("They said they will burn our house if we do not withdraw the case.");
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

test("an interaction the calling system never ended is closed as abandoned after a day without activity", async ({ request }) => {
  const v = await integrationSession(request);
  await v.say("I only wanted to ask about the next hearing date.");
  const iid = new mongoose.Types.ObjectId(v.interactionId);
  await withDb(async (db) => {
    // Pretend the last activity was two days ago (timestamps are not touched by updateOne with $set on updatedAt).
    await db.collection("interactions").updateOne({ _id: iid }, { $set: { updatedAt: new Date(Date.now() - 2 * 86_400_000) } });
    await db.collection("jobs").updateMany({ type: "retention.purge", doneAt: null }, { $set: { runAt: new Date("2000-01-01T00:00:00Z") } });
    const pending = await db.collection("jobs").countDocuments({ type: "retention.purge", doneAt: null });
    if (!pending) await db.collection("jobs").insertOne({ type: "retention.purge", payload: {}, runAt: new Date("2000-01-01T00:00:00Z"), attempts: 0, doneAt: null, lockedUntil: null });
  });
  expect((await request.post("/api/v1/internal/jobs/run", { headers: { "x-jobs-secret": process.env.JOBS_SECRET! } })).status()).toBe(200);
  await withDb(async (db) => {
    const i = await db.collection("interactions").findOne({ _id: iid });
    expect(i!.status).toBe("ABANDONED");
    expect(i!.retentionUntil).toBeInstanceOf(Date);
  });
});
