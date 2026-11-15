/**
 * Scoring configuration versions (task 8.6, FR-SVI-06/07, API_CONTRACTS §5.9).
 * New versions are created inactive; activation switches exactly one active version and
 * re-scores active interactions with it. Locks set by a human are respected by the scoring
 * code itself (bands never drop below a lock, FR-RISK-03). Every change is audited.
 */
import mongoose from "mongoose";
import { record } from "@/core/audit/record";
import { scoreInteraction } from "@/core/pipeline/score";
import { clearConfigCache } from "@/core/scoring/activeConfig";
import { validateConfig } from "@/core/scoring/config";
import type { ScoringConfig as ScoringConfigShape } from "@/core/scoring/types";
import { ApiError } from "@/lib/problem";
import type { OutboundEvent } from "@/lib/realtime/channels";
import { publish } from "@/lib/realtime/publish";
import { Case, Interaction, ScoringConfig } from "@/models";

const ID = (v: unknown) => String(v);
/** Re-scoring on activation covers the sessions that are still live. */
const RESCORE_LIMIT = 200;

export async function listConfigs() {
  const docs = await ScoringConfig.find().sort({ version: -1 }).limit(50).lean();
  return docs.map((d) => ({
    id: ID(d._id),
    version: d.version,
    isActive: d.isActive,
    notes: d.notes ?? null,
    createdAt: new Date(d.createdAt as unknown as Date).toISOString(),
    config: JSON.parse(JSON.stringify({ ...d, _id: undefined, createdById: undefined, createdAt: undefined })) as Record<string, unknown>,
  }));
}

export async function createConfig(userId: string, input: Record<string, unknown>) {
  const next = ((await ScoringConfig.findOne().sort({ version: -1 }).select("version").lean())?.version ?? 0) + 1;
  const checked = validateConfig({ ...input, version: next });
  if (!checked.ok) throw new ApiError("INVALID_CONFIG", checked.errors.join("; "));
  const plain = JSON.parse(JSON.stringify(checked.config)) as Record<string, unknown>; // readonly arrays → plain JSON
  const doc = await ScoringConfig.create({ ...plain, version: next, isActive: false, notes: typeof input.notes === "string" ? input.notes.slice(0, 500) : undefined, createdById: userId });
  await record({ actorType: "USER", actorId: userId, action: "scoringConfig.create", entityType: "scoringConfig", entityId: ID(doc._id), metadata: { version: next } });
  return { id: ID(doc._id), version: next };
}

export async function loadConfig(id: string): Promise<ScoringConfigShape> {
  if (!/^[a-f0-9]{24}$/.test(id)) throw new ApiError("NOT_FOUND");
  const doc = await ScoringConfig.findById(id).lean();
  if (!doc) throw new ApiError("NOT_FOUND");
  const checked = validateConfig(JSON.parse(JSON.stringify(doc)) as Record<string, unknown>);
  if (!checked.ok) throw new ApiError("INVALID_CONFIG", checked.errors.join("; "));
  return checked.config;
}

/**
 * Switches the active version. Returns at once with how many live interactions will be re-scored;
 * the caller runs `rescore()` after the response (it can take a while with many live sessions).
 */
export async function activateConfig(userId: string, id: string): Promise<{ version: number; rescoring: number; rescore: () => Promise<number> }> {
  const config = await loadConfig(id);
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      await ScoringConfig.updateMany({ isActive: true, _id: { $ne: id } }, { $set: { isActive: false } }, { session });
      await ScoringConfig.updateOne({ _id: id }, { $set: { isActive: true } }, { session });
      await record({ actorType: "USER", actorId: userId, action: "scoringConfig.activate", entityType: "scoringConfig", entityId: id, metadata: { version: config.version } }, session);
    });
  } finally {
    await session.endSession();
  }
  clearConfigCache();
  const rescoring = Math.min(RESCORE_LIMIT, await Interaction.countDocuments({ status: "ACTIVE" }));
  return { version: config.version, rescoring, rescore: () => rescoreActive(config, id, userId) };
}

/** CONFIG_RESCORE for live interactions, one transaction each; events after each commit. */
async function rescoreActive(config: ScoringConfigShape, configId: string, userId: string): Promise<number> {
  const live = await Interaction.find({ status: "ACTIVE" }).select("_id caseId").sort({ startedAt: -1 }).limit(RESCORE_LIMIT).lean();
  let n = 0;
  for (const l of live) {
    // Another version was activated meanwhile: that activation re-scores; stop here.
    if (!(await ScoringConfig.exists({ _id: configId, isActive: true }))) break;
    const session = await mongoose.startSession();
    let events: OutboundEvent[] = [];
    try {
      await session.withTransaction(async () => {
        const interaction = await Interaction.findById(l._id).session(session);
        const caseDoc = await Case.findById(l.caseId).session(session);
        if (!interaction || !caseDoc) return;
        const scored = await scoreInteraction(session, interaction, caseDoc, { trigger: "CONFIG_RESCORE", now: new Date(), config, actor: { type: "USER", id: userId } });
        await interaction.save({ session });
        await caseDoc.save({ session });
        events = scored.events;
      });
      n += 1;
    } catch (err) {
      console.error(`[config] rescore failed: ${(err as Error)?.name ?? "Error"}`);
    } finally {
      await session.endSession();
    }
    await publish(events);
  }
  return n;
}
