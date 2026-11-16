/**
 * GET /api/v1/integration/interactions/{id}/stream (task 8.4, §6, FR-API-03): Server-Sent Events.
 *
 * `assessment.updated`, `emergency.show` (when the band reaches Critical) and
 * `recommendation.created`. The stream polls the database once a second rather than
 * subscribing to the real-time transport, so it works with either driver (Pusher or local SSE)
 * and on serverless hosting. A new connection first gets the current state; it closes after
 * STREAM_MS, and clients reconnect with `Last-Event-ID` (the assessment sequence number) to
 * receive only newer events.
 */
import { loadOwned } from "@/core/integration/owned";
import { latestAssessment } from "@/core/integration/assessment";
import { emergencyPanel } from "@/core/interactions/emergency";
import { route } from "@/lib/route";
import { Assessment, Recommendation } from "@/models";

export const maxDuration = 60;
const STREAM_MS = 55_000;
const POLL_MS = 1_000;

export const GET = route({ auth: "api", scope: "stream:read" }, async ({ req, client, params }) => {
  const own = await loadOwned(String(params.id), client.id);
  const lastSeq = Number(req.headers.get("last-event-id") ?? "") || -1;
  const encoder = new TextEncoder();
  // First connection: a snapshot (current assessment and recommendations). Reconnection:
  // only what is newer than the event the client last saw.
  const seen = lastSeq >= 0 ? await Assessment.findOne({ interactionId: own.id, seq: lastSeq }).select("createdAt").lean() : null;
  const since = seen ? new Date(seen.createdAt as unknown as Date) : new Date(0);

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, id: string, data: unknown) =>
        controller.enqueue(encoder.encode(`event: ${event}\nid: ${id}\ndata: ${JSON.stringify(data)}\n\n`));
      let seq = lastSeq;
      let emergencySent = false;
      const seenRecs = new Set<string>();
      const stopAt = Date.now() + STREAM_MS;
      controller.enqueue(encoder.encode(`retry: 2000\n\n`));
      while (!req.signal.aborted && Date.now() < stopAt) {
        try {
          const a = await latestAssessment(own.id);
          if (a && a.seq > seq) {
            seq = a.seq;
            send("assessment.updated", String(a.seq), {
              interactionId: own.id,
              assessmentId: a.assessmentId,
              seq: a.seq,
              svi: a.svi,
              band: a.band,
              confidence: a.confidence,
              limitedConfidence: a.limitedConfidence,
              at: a.updatedAt,
            });
            if (a.band === "CRITICAL" && !emergencySent) {
              emergencySent = true;
              send("emergency.show", String(a.seq), { emergency: emergencyPanel(own.lang) });
            }
          }
          const recs = await Recommendation.find({ interactionId: own.id, status: { $ne: "SUPERSEDED" }, createdAt: { $gt: since } })
            .select("type urgency status")
            .lean();
          for (const r of recs) {
            if (seenRecs.has(String(r._id))) continue;
            seenRecs.add(String(r._id));
            send("recommendation.created", String(seq), { recommendationId: String(r._id), type: r.type, urgency: r.urgency, status: r.status });
          }
        } catch {
          controller.enqueue(encoder.encode(`: temporary error, retrying\n\n`));
        }
        await new Promise((resolve) => setTimeout(resolve, POLL_MS));
      }
      controller.close();
    },
  });
  return new Response(stream, {
    headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-store, no-transform", connection: "keep-alive", "x-accel-buffering": "no" },
  });
});
