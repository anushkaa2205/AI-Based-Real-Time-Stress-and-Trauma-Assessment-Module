/**
 * Victim interaction service (tasks 3.2, 3.3, 3.6). Database work behind the
 * victim endpoints. Nothing returned from here reaches the victim except
 * prompts, the emergency flag and the docket number (CLAUDE.md rule 1).
 */
import { toVictimLang } from "@/contracts/victim";
import { createHmac, randomInt } from "node:crypto";
import type { ConsentRequest, Prompt, VictimLang } from "@/contracts/victim";
import { record } from "@/core/audit/record";
import { formatDocket } from "@/core/cases/docket";
import { NOTICE_VERSION, currentConsent, resolveMode } from "@/core/consent/mode";
import { flowStateOf, nextStep, promptFor } from "@/core/conversation/flow";
import { t } from "@/core/i18n/messages";
import { encrypt } from "@/core/privacy/crypto";
import { startRetention } from "@/core/privacy/retention";
import { isMinor, type CaseContextInput } from "@/core/scoring/context";
import { shouldShowEmergency } from "@/core/victim/emergency";
import { hashSessionToken, newSessionToken, SESSION_TTL_MS } from "@/core/victim/session";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { piiDb } from "@/lib/pii-db";
import { ONCALL } from "@/lib/realtime/channels";
import { publish } from "@/lib/realtime/publish";
import { ApiError } from "@/lib/problem";
import { Alert, Case, District, Interaction, Job, State, StoredAudio, Subject, type Channel } from "@/models";
import { SubjectIdentity } from "@/models/subject-identity";

export const QUICK_EXIT_URL = "https://www.google.com";

export function consentNotice(lang: VictimLang) {
  return {
    version: NOTICE_VERSION,
    language: lang,
    title: t(lang, "consent.title"),
    body: ["what", "why", "who", "howLong", "refuse", "withdraw"].map((k) => t(lang, `consent.${k}`)),
    options: ["textAnalysis", "voiceAnalysis", "shareWithCounsellor", "followUpContact", "audioRetention"] as const,
  };
}

// --- start --------------------------------------------------------------------------

/** Who is acting: the victim's own session, or an integrating system (task 8.4). */
export type ServiceActor = { type: "VICTIM_SESSION" } | { type: "API_CLIENT"; id: string };

export async function startInteraction(input: {
  channel: Channel;
  language: VictimLang;
  docketNumber?: string | null;
  districtCode?: string | null;
  apiClientId?: string;
  externalRef?: string;
}): Promise<{ interactionId: string; docketNumber: string; token: string }> {
  await db();
  const district = input.districtCode ? await District.findOne({ code: input.districtCode }).lean() : null;
  const state = district ? await State.findById(district.stateId).lean() : null;

  let caseDoc = input.docketNumber ? await Case.findOne({ docketNumber: input.docketNumber }) : null;
  if (!caseDoc) {
    const subject = await Subject.create({});
    const year = new Date().getUTCFullYear();
    for (let attempt = 0; attempt < 5 && !caseDoc; attempt++) {
      try {
        caseDoc = await Case.create({
          docketNumber: input.docketNumber ?? formatDocket(year, state?.code ?? "XX", randomInt(0, 1_000_000)),
          subjectId: subject._id,
          stateId: state?._id,
          districtId: district?._id,
          status: "NEW",
        });
      } catch (err) {
        if ((err as { code?: number }).code !== 11000 || input.docketNumber) throw err; // retry only generated numbers
      }
    }
    if (!caseDoc) throw new ApiError("INTERNAL");
  }

  const token = newSessionToken();
  const interaction = await Interaction.create({
    caseId: caseDoc._id,
    subjectId: caseDoc.subjectId,
    channel: input.channel,
    uiLanguage: input.language,
    districtId: caseDoc.districtId,
    mode: "SAFETY_ONLY", // analysis is off until consent (AC-CON-01)
    sessionTokenHash: hashSessionToken(token),
    sessionExpiresAt: new Date(Date.now() + SESSION_TTL_MS),
    ...(input.apiClientId ? { apiClientId: input.apiClientId, externalRef: input.externalRef } : {}),
  });
  await record({
    actorType: input.apiClientId ? "API_CLIENT" : "VICTIM_SESSION",
    actorId: input.apiClientId ?? String(interaction._id),
    action: "interaction.start",
    entityType: "interaction",
    entityId: String(interaction._id),
    metadata: { channel: input.channel, language: input.language },
  });
  return { interactionId: String(interaction._id), docketNumber: caseDoc.docketNumber, token };
}

// --- flow ------------------------------------------------------------------------------

async function loadInteraction(id: string) {
  await db();
  const interaction = await Interaction.findById(id);
  if (!interaction) throw new ApiError("NOT_FOUND");
  return interaction;
}

function answeredMap(responses: { itemCode: string; value?: number | null; skipped?: boolean | null }[]) {
  const m = new Map<string, number | null>();
  for (const r of responses) m.set(r.itemCode, r.skipped || r.value === null || r.value === undefined ? null : r.value);
  return m;
}

/** Current prompt + emergency flag for an interaction. */
export async function currentTurn(id: string): Promise<{ prompt: Prompt; showEmergencyPanel: boolean; lang: VictimLang }> {
  const interaction = await loadInteraction(id);
  const caseDoc = await Case.findById(interaction.caseId).select("currentBand").lean();
  const lang: VictimLang = toVictimLang(interaction.uiLanguage);
  const step = nextStep({
    consentGiven: interaction.consents.length > 0,
    mode: interaction.mode,
    answered: answeredMap(interaction.screenerResponses),
    state: flowStateOf(interaction.flowState),
  });
  return { prompt: promptFor(step, lang), showEmergencyPanel: shouldShowEmergency(caseDoc?.currentBand), lang };
}

export async function requireActive(id: string) {
  const interaction = await loadInteraction(id);
  if (interaction.status !== "ACTIVE") throw new ApiError("INTERACTION_ENDED");
  return interaction;
}

// --- consent (FR-CON-01…06) ----------------------------------------------------------------

export async function giveConsent(id: string, c: ConsentRequest, actor: ServiceActor = { type: "VICTIM_SESSION" }) {
  const interaction = await requireActive(id);
  if (c.noticeVersion !== NOTICE_VERSION) throw new ApiError("VALIDATION_FAILED", "Unknown consent notice version");
  const entry = {
    action: interaction.consents.length ? ("UPDATED" as const) : ("GRANTED" as const),
    noticeVersion: c.noticeVersion,
    language: c.language,
    textAnalysis: c.textAnalysis,
    voiceAnalysis: c.voiceAnalysis,
    shareWithCounsellor: c.shareWithCounsellor,
    followUpContact: c.followUpContact,
    audioRetention: c.audioRetention,
    guardianConsent: c.guardianConsent ?? undefined,
    at: new Date(),
  };
  interaction.consents.push(entry);
  const ctx = (interaction.context ?? {}) as CaseContextInput;
  interaction.mode = resolveMode(currentConsent([entry]), { isMinor: isMinor(ctx) });
  await interaction.save();
  await record({
    actorType: actor.type,
    actorId: actor.type === "API_CLIENT" ? actor.id : id,
    action: `consent.${entry.action.toLowerCase()}`,
    entityType: "interaction",
    entityId: id,
    metadata: {
      noticeVersion: c.noticeVersion,
      language: c.language,
      textAnalysis: c.textAnalysis,
      voiceAnalysis: c.voiceAnalysis,
      shareWithCounsellor: c.shareWithCounsellor,
      followUpContact: c.followUpContact,
      audioRetention: c.audioRetention,
      mode: interaction.mode,
    },
  });
  return interaction.mode;
}

/** FR-CON-04: analysis stops at once; stored audio is deleted. The complaint stays. */
export async function withdrawConsent(id: string) {
  const interaction = await requireActive(id);
  const last = interaction.consents.at(-1);
  interaction.consents.push({
    action: "WITHDRAWN",
    noticeVersion: last?.noticeVersion ?? NOTICE_VERSION,
    language: interaction.uiLanguage,
    textAnalysis: false,
    voiceAnalysis: false,
    shareWithCounsellor: false,
    followUpContact: false,
    audioRetention: false,
    at: new Date(),
  });
  interaction.mode = "SAFETY_ONLY";
  await interaction.save();
  // Raw audio is only stored with consent (Phase 7); remove any that exists.
  await StoredAudio.deleteMany({ interactionId: interaction._id });
  await record({ actorType: "VICTIM_SESSION", actorId: id, action: "consent.withdraw", entityType: "interaction", entityId: id });
  return { mode: "SAFETY_ONLY" as const, audioDeleted: true };
}

// --- simple flow updates -------------------------------------------------------------------

export async function skipNarrative(id: string) {
  const interaction = await requireActive(id);
  const flow = flowStateOf(interaction.flowState);
  flow.narrativeDone = true;
  interaction.flowState = flow;
  interaction.markModified("flowState");
  await interaction.save();
}

/** A spoken answer counts as one narrative turn (task 7.1); its windows were analysed as they arrived. */
export async function voiceTurnDone(id: string) {
  const interaction = await requireActive(id);
  const flow = flowStateOf(interaction.flowState);
  flow.narrativeTurns += 1;
  interaction.flowState = flow;
  interaction.markModified("flowState");
  await interaction.save();
}

export async function setLanguage(id: string, lang: VictimLang) {
  const interaction = await requireActive(id);
  interaction.uiLanguage = lang;
  await interaction.save();
}

// --- callback (FR-REC-06): phone goes ONLY to the PII vault -----------------------------------

function phoneHash(phone: string): string {
  const e = env();
  const key = e.ENCRYPTION_KEYS[e.ENCRYPTION_ACTIVE_KEY]!;
  return createHmac("sha256", key).update(`phone:${phone.replace(/[^0-9+]/g, "")}`).digest("hex");
}

export async function requestCallback(id: string, phone: string) {
  const interaction = await requireActive(id);
  await piiDb();
  await SubjectIdentity().updateOne(
    { _id: interaction.subjectId },
    { $set: { phoneEnc: encrypt(phone), phoneHash: phoneHash(phone) } },
    { upsert: true },
  );
  const now = new Date();
  const escalateAt = new Date(now.getTime() + 120_000);
  const alert = await Alert.findOneAndUpdate(
    { caseId: interaction.caseId, level: "CRITICAL", status: "OPEN" },
    {
      $setOnInsert: { caseId: interaction.caseId, interactionId: interaction._id, level: "CRITICAL", status: "OPEN", escalationLevel: 0 },
      $set: { reason: "Caller asked for an immediate call back", escalateAt },
    },
    { upsert: true, returnDocument: "after" },
  );
  await Alert.updateMany(
    { caseId: interaction.caseId, level: "HIGH", status: "OPEN" },
    { $set: { status: "RESOLVED", resolvedAt: now } },
  );
  if (alert) await Job.create({ type: "alert.escalate", payload: { alertId: String(alert._id), level: 1 }, runAt: escalateAt });
  await record({ actorType: "VICTIM_SESSION", actorId: id, action: "callback.request", entityType: "case", entityId: String(interaction.caseId) });
  // On-duty staff see the call-back request at once (FR-REC-06); the phone number never leaves the vault.
  if (alert) {
    const c = await Case.findById(interaction.caseId).select("docketNumber").lean();
    await publish([
      {
        channel: ONCALL,
        event: "alert.created",
        data: { alertId: String(alert._id), caseId: String(interaction.caseId), docketNumber: c?.docketNumber ?? "", level: "CRITICAL", reason: alert.reason, createdAt: new Date(alert.createdAt).toISOString() },
      },
    ]);
  }
}

// --- end (FR-CH-09) -------------------------------------------------------------------------

export async function endInteraction(id: string, reason: "COMPLETED" | "QUICK_EXIT" | "TIMEOUT") {
  const interaction = await loadInteraction(id);
  const caseDoc = await Case.findById(interaction.caseId).select("docketNumber").lean();
  if (interaction.status === "ACTIVE") {
    const flow = flowStateOf(interaction.flowState);
    flow.closed = true;
    interaction.flowState = flow;
    interaction.markModified("flowState");
    interaction.status = reason === "COMPLETED" ? "ENDED" : "ABANDONED";
    interaction.endedAt = new Date();
    interaction.sessionExpiresAt = new Date(); // the token stops working now
    await interaction.save();
    await startRetention(interaction._id, interaction.endedAt); // NFR-PRI-04 (task 8.7)
    await record({ actorType: "VICTIM_SESSION", actorId: id, action: "interaction.end", entityType: "interaction", entityId: id, metadata: { reason } });
  }
  return { docketNumber: caseDoc?.docketNumber ?? "", lang: toVictimLang(interaction.uiLanguage) };
}
