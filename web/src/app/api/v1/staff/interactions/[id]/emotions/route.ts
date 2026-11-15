/**
 * GET /api/v1/staff/interactions/{id}/emotions (API_CONTRACTS §5.3, FR-EMO-03, task 7.7):
 * text, voice and fused emotion across the session, for the timeline.
 */
import { loadInteractionResource } from "@/core/cases/resource";
import { route } from "@/lib/route";
import { Interaction, Message, VoiceWindow } from "@/models";

type Emo = { label: string; confidence: number } | null;
const emo = (e: { label?: string | null; confidence?: number | null } | null | undefined): Emo =>
  e?.label ? { label: e.label, confidence: e.confidence ?? 0 } : null;

export const GET = route({ auth: "staff", action: "case.transcript.read" }, async ({ params, authorize }) => {
  const id = String(params.id);
  const { resource } = await loadInteractionResource(id);
  authorize("case.transcript.read", resource);
  const [interaction, messages, windows] = await Promise.all([
    Interaction.findById(id).select("startedAt").lean(),
    Message.find({ interactionId: id, sender: "VICTIM" }).select("emotion createdAt").sort({ seq: 1 }).lean(),
    VoiceWindow.find({ interactionId: id }).select("messageId startMs emotion fusedEmotion").sort({ windowIndex: 1 }).lean(),
  ]);
  const t0 = interaction ? new Date(interaction.startedAt).getTime() : 0;
  const byMessage = new Map(messages.map((m) => [String(m._id), m]));
  const used = new Set<string>();
  const items: { atMs: number; text: Emo; voice: Emo; fused: Emo }[] = [];
  for (const w of windows) {
    const m = w.messageId ? byMessage.get(String(w.messageId)) : undefined;
    if (m) used.add(String(m._id));
    items.push({ atMs: w.startMs, text: emo(m?.emotion), voice: emo(w.emotion), fused: emo(w.fusedEmotion) ?? emo(w.emotion) });
  }
  for (const m of messages) {
    if (used.has(String(m._id)) || !m.emotion?.label) continue;
    const text = emo(m.emotion);
    items.push({ atMs: Math.max(0, new Date(m.createdAt).getTime() - t0), text, voice: null, fused: text });
  }
  items.sort((a, b) => a.atMs - b.atMs);
  return { items };
});
