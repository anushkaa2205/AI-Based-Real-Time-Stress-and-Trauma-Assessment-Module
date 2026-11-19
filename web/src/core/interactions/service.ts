/**
 * Interaction service behind the integration API (tasks 3.2, 3.3, 8.4, M.2).
 * A calling NHAA system starts an interaction with the consent it collected, may
 * withdraw consent, and ends it. There is no victim session and no question flow
 * (PRODUCT_VISION.md §5): the module never decides what to ask.
 */
import { randomInt } from "node:crypto";
import { toVictimLang, type ConsentRequest, type VictimLang } from "@/contracts/interaction";
import { record } from "@/core/audit/record";
import { formatDocket } from "@/core/cases/docket";
import { NOTICE_VERSION, currentConsent, resolveMode } from "@/core/consent/mode";
import { startRetention } from "@/core/privacy/retention";
import { isMinor, type CaseContextInput } from "@/core/scoring/context";
import { db } from "@/lib/db";
import { ApiError } from "@/lib/problem";
import { queueChannelsFor } from "@/lib/realtime/channels";
import { publish } from "@/lib/realtime/publish";
import { encrypt } from "@/core/privacy/crypto";
import { Case, District, Interaction, Message, State, StoredAudio, Subject, type Channel, type InputMethod } from "@/models";

/** Who is acting: an integrating system (API key). */
export type ServiceActor = { type: "API_CLIENT"; id: string };

// --- start ----------------------------------------------------------------------------

export async function startInteraction(input: {
  channel: Channel;
  language: VictimLang;
  docketNumber?: string | null;
  districtCode?: string | null;
  apiClientId: string;
  externalRef?: string;
  /** Task M.7: from the API client on the server, never from the request body */
  isPortal?: boolean;
}): Promise<{ interactionId: string; docketNumber: string }> {
  await db();
  const district = input.districtCode ? await District.findOne({ code: input.districtCode }).lean() : null;
  const state = district ? await State.findById(district.stateId).lean() : null;

  let caseDoc = input.docketNumber ? await Case.findOne({ docketNumber: input.docketNumber }) : null;
  const isNewCase = !caseDoc;
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
          isPortal: input.isPortal === true,
        });
      } catch (err) {
        if ((err as { code?: number }).code !== 11000 || input.docketNumber) throw err; // retry only generated numbers
      }
    }
    if (!caseDoc) throw new ApiError("INTERNAL");
  }

  const interaction = await Interaction.create({
    caseId: caseDoc._id,
    subjectId: caseDoc.subjectId,
    channel: input.channel,
    uiLanguage: input.language,
    districtId: caseDoc.districtId,
    mode: "SAFETY_ONLY", // analysis is off until consent is recorded (AC-CON-01)
    apiClientId: input.apiClientId,
    externalRef: input.externalRef,
    isPortal: input.isPortal === true,
  });
  await record({
    actorType: "API_CLIENT",
    actorId: input.apiClientId,
    action: "interaction.start",
    entityType: "interaction",
    entityId: String(interaction._id),
    metadata: { channel: input.channel, language: input.language },
  });
  if (isNewCase) {
    // API_CONTRACTS §7: a new case reaches the staff queues at once, before its first message is scored (FR-CASE-01).
    const data = {
      caseId: String(caseDoc._id),
      docketNumber: caseDoc.docketNumber,
      band: null,
      svi: null,
      status: caseDoc.status,
      assignedToId: null,
      waitingSince: new Date(caseDoc.waitingSince ?? Date.now()).toISOString(),
    };
    await publish(queueChannelsFor(caseDoc.districtId ? String(caseDoc.districtId) : null).map((channel) => ({ channel, event: "case.created" as const, data })));
  }
  return { interactionId: String(interaction._id), docketNumber: caseDoc.docketNumber };
}

async function loadInteraction(id: string) {
  await db();
  const interaction = await Interaction.findById(id);
  if (!interaction) throw new ApiError("NOT_FOUND");
  return interaction;
}

export async function requireActive(id: string) {
  const interaction = await loadInteraction(id);
  if (interaction.status !== "ACTIVE") throw new ApiError("INTERACTION_ENDED");
  return interaction;
}

// --- consent (FR-CON-01…06) ----------------------------------------------------------------

export async function giveConsent(id: string, c: ConsentRequest, actor: ServiceActor) {
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
    actorId: actor.id,
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

/** FR-CON-04: analysis stops at once; stored audio is deleted. The case stays. */
export async function withdrawConsent(id: string, actor: ServiceActor) {
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
  // Raw audio is only stored with consent; remove any that exists.
  await StoredAudio.deleteMany({ interactionId: interaction._id });
  await record({ actorType: actor.type, actorId: actor.id, action: "consent.withdraw", entityType: "interaction", entityId: id });
  return { mode: "SAFETY_ONLY" as const, audioDeleted: true };
}

// --- operator turns (FR-CH-02) ------------------------------------------------------------

/**
 * Stores a question or remark from NHAA's chatbot or operator: encrypted, in order, never scored.
 * The person's next message is read with it (FR-NLP-11). Used for typed turns and, since task M.10,
 * for the operator's words separated out of two-voice call audio.
 */
export async function addOperatorTurn(
  id: string,
  text: string,
  opts: { modality?: "TEXT" | "VOICE_TRANSCRIPT"; idempotencyKey?: string; inputMethod?: InputMethod } = {},
): Promise<string> {
  await db();
  if (opts.idempotencyKey) {
    const dup = await Message.findOne({ interactionId: id, idempotencyKey: opts.idempotencyKey }).select("_id").lean();
    if (dup) return String(dup._id);
  }
  const i = await Interaction.findOneAndUpdate({ _id: id, status: "ACTIVE" }, { $inc: { messageSeq: 1 } }, { returnDocument: "after" }).select("messageSeq").lean();
  if (!i) throw new ApiError("INTERACTION_ENDED");
  const m = await Message.create({
    interactionId: id,
    seq: i.messageSeq,
    sender: "OPERATOR",
    modality: opts.modality ?? "TEXT",
    inputMethod: opts.inputMethod,
    textEnc: encrypt(text),
    idempotencyKey: opts.idempotencyKey,
  });
  return String(m._id);
}

// --- end --------------------------------------------------------------------------------

export async function endInteraction(id: string, reason: "COMPLETED" | "TIMEOUT", actor: ServiceActor) {
  const interaction = await loadInteraction(id);
  const caseDoc = await Case.findById(interaction.caseId).select("docketNumber").lean();
  if (interaction.status === "ACTIVE") {
    interaction.status = reason === "COMPLETED" ? "ENDED" : "ABANDONED";
    interaction.endedAt = new Date();
    interaction.set("speakerStateEnc", undefined); // voice fingerprints are biometric: gone with the call (M.10)
    await interaction.save();
    await startRetention(interaction._id, interaction.endedAt); // NFR-PRI-04 (task 8.7)
    await record({ actorType: actor.type, actorId: actor.id, action: "interaction.end", entityType: "interaction", entityId: id, metadata: { reason } });
  }
  return { docketNumber: caseDoc?.docketNumber ?? "", lang: toVictimLang(interaction.uiLanguage) };
}
