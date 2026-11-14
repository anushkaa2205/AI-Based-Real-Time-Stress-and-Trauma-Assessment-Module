/**
 * GET /api/v1/staff/interactions/{id}/transcript (task 5.3, FR-LANG-06).
 * Needs the victim's shareWithCounsellor consent for counsellors (§4 rule 3).
 * Audited as transcript.view.
 */
import { z } from "zod";
import { decodeCursor, encodeCursor } from "@/contracts/staff";
import { record } from "@/core/audit/record";
import { loadInteractionResource } from "@/core/cases/resource";
import { decrypt } from "@/core/privacy/crypto";
import { route } from "@/lib/route";
import { Message } from "@/models";

const PAGE = 100;
const open = (v: string | null | undefined) => {
  if (!v) return null;
  try {
    return decrypt(v);
  } catch {
    return null;
  }
};

export const GET = route(
  { auth: "staff", action: "case.transcript.read", query: z.object({ cursor: z.string().max(40).optional() }) },
  async ({ user, params, query, authorize }) => {
    const id = String(params.id);
    const { resource } = await loadInteractionResource(id);
    authorize("case.transcript.read", resource);
    const offset = decodeCursor(query.cursor);
    const rows = await Message.find({ interactionId: id }).sort({ seq: 1 }).skip(offset).limit(PAGE + 1).lean();
    await record({ actorType: "USER", actorId: user.id, action: "transcript.view", entityType: "interaction", entityId: id });
    return {
      items: rows.slice(0, PAGE).map((m) => ({
        id: String(m._id),
        seq: m.seq,
        sender: m.sender,
        modality: m.modality,
        text: open(m.textEnc) ?? "",
        translation: open(m.translationEnc),
        language: m.language ?? null,
        sttConfidence: m.sttConfidence ?? null,
        emotion: m.emotion?.label ? { label: m.emotion.label, confidence: m.emotion.confidence ?? 0 } : null,
        createdAt: new Date(m.createdAt).toISOString(),
      })),
      nextCursor: rows.length > PAGE ? encodeCursor(offset + PAGE) : null,
    };
  },
);
