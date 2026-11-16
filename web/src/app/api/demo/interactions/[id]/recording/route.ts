/**
 * POST /api/demo/interactions/{id}/recording (API_CONTRACTS §6.5, tasks M.8 and M.14).
 * A recorded WAV (a library file on this server, or an upload) is cut into 5 s windows on the
 * server and sent to `POST /api/v1/integration/…/audio` one at a time, in order, with the demo
 * key: the real audio through the real audio path, never a prewritten transcript.
 * Streams one NDJSON line per window so the presenter sees each window land. Each request stops
 * after ~45 s (hosting limit: 60 s on Vercel Hobby) with a `more` event; the page then sends the
 * same recording again from `nextWindow`, so any length of recording works.
 */
import { readFileSync, statSync } from "node:fs";
import { DemoRecordingJson, MAX_UPLOAD_BYTES, RecordingFields, type RecordingEvent } from "@/contracts/demo";
import { callModule } from "@/core/demo/client";
import { findScenario, MAX_LIBRARY_FILE_BYTES, recordingPath } from "@/core/demo/library";
import { demoRoute, originOf } from "@/core/demo/route";
import { cutWav, WavError } from "@/core/demo/wav";
import { ApiError } from "@/lib/problem";

/** Vercel Hobby (without Fluid Compute) allows 60 s; each request works for at most BUDGET_MS of it. */
export const maxDuration = 60;
/** Per-request work budget; DEMO_RECORDING_BUDGET_MS lowers it so tests can force a recording into several requests. */
const BUDGET_MS = Math.min(50_000, Math.max(1_000, Number(process.env.DEMO_RECORDING_BUDGET_MS) || 45_000));

interface AudioReply {
  transcript?: string | null;
  analysed?: boolean;
  title?: string;
  code?: string;
}

async function readSource(req: Request): Promise<{
  bytes: Uint8Array;
  audioSource: "CALLER_ONLY" | "MIXED";
  firstSpeaker: "OPERATOR" | "CALLER";
  source: "library" | "upload";
  scenarioId: string | null;
  fromWindow: number;
}> {
  const type = req.headers.get("content-type") ?? "";
  if (type.startsWith("application/json")) {
    const parsed = DemoRecordingJson.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw new ApiError("VALIDATION_FAILED", "scenarioId is required");
    const s = findScenario(parsed.data.scenarioId);
    if (!s) throw new ApiError("NOT_FOUND", "No such scenario in the library");
    if (!s.recordingAvailable) throw new ApiError("NOT_FOUND", "This scenario has not been recorded yet");
    const path = recordingPath(s.id);
    if (statSync(path).size > MAX_LIBRARY_FILE_BYTES) throw new ApiError("PAYLOAD_TOO_LARGE");
    return { bytes: new Uint8Array(readFileSync(path)), audioSource: s.audioSource, firstSpeaker: s.firstSpeaker, source: "library", scenarioId: s.id, fromWindow: parsed.data.fromWindow };
  }
  if (!type.startsWith("multipart/form-data")) throw new ApiError("VALIDATION_FAILED", "Send JSON { scenarioId } or a multipart WAV upload");
  if (Number(req.headers.get("content-length") ?? "0") > MAX_UPLOAD_BYTES + 16_384) throw new ApiError("PAYLOAD_TOO_LARGE", "Uploads are limited to 4 MB");
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof Blob) || file.size === 0) throw new ApiError("VALIDATION_FAILED", "A WAV file is required");
  if (file.size > MAX_UPLOAD_BYTES) throw new ApiError("PAYLOAD_TOO_LARGE", "Uploads are limited to 4 MB");
  const fields = RecordingFields.parse({ audioSource: form?.get("audioSource") ?? undefined, firstSpeaker: form?.get("firstSpeaker") ?? undefined, fromWindow: form?.get("fromWindow") ?? undefined });
  return { bytes: new Uint8Array(await file.arrayBuffer()), ...fields, source: "upload", scenarioId: null };
}

export const POST = demoRoute({}, async ({ req, params }) => {
  const t0 = Date.now();
  const id = String(params.id);
  if (!/^[a-f0-9]{24}$/.test(id)) throw new ApiError("NOT_FOUND");
  const src = await readSource(req);
  let cut: ReturnType<typeof cutWav>;
  try {
    cut = cutWav(src.bytes);
  } catch (err) {
    if (err instanceof WavError) throw new ApiError(err.code === "TOO_LONG" ? "PAYLOAD_TOO_LARGE" : "BAD_AUDIO", err.message);
    throw err;
  }
  src.bytes.fill(0); // the original file is not kept (FR-VOI-09)
  const origin = originOf(req);
  const enc = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (e: RecordingEvent) => controller.enqueue(enc.encode(`${JSON.stringify(e)}\n`));
      send({ type: "start", windows: cut.windows.length, durationMs: cut.info.durationMs, source: src.source, scenarioId: src.scenarioId, fromWindow: src.fromWindow });
      let analysed = 0;
      try {
        for (const w of cut.windows) {
          if (w.windowIndex < src.fromWindow) continue; // sent by an earlier request
          if (Date.now() - t0 > BUDGET_MS) {
            send({ type: "more", nextWindow: w.windowIndex, windows: cut.windows.length });
            return;
          }
          const form = new FormData();
          form.set("audio", new Blob([w.wav as BlobPart], { type: "audio/wav" }), `window-${w.windowIndex}.wav`);
          form.set("windowIndex", String(w.windowIndex));
          form.set("startMs", String(w.startMs));
          form.set("audioSource", src.audioSource);
          form.set("firstSpeaker", src.firstSpeaker);
          form.set("inputMethod", "RECORDED_AUDIO"); // M.6
          let r = await callModule<AudioReply>(origin, `/interactions/${id}/audio`, { form });
          // A window the module could not analyse (e.g. a timeout) is not stored, so it can be sent again.
          // Retrying once matters most for window 0, which anchors who is the operator (API_CONTRACTS §6.3).
          if (r.status === 202 && r.body?.analysed === false) {
            await new Promise((ok) => setTimeout(ok, 1_000));
            const again = await callModule<AudioReply>(origin, `/interactions/${id}/audio`, { form });
            r = { ...again, call: { requestId: again.call.requestId, ms: r.call.ms + again.call.ms } };
          }
          w.wav.fill(0);
          const ok = r.status === 202 || r.status === 200;
          if (ok && r.body?.analysed) analysed += 1;
          send({
            type: "window",
            windowIndex: w.windowIndex,
            startMs: w.startMs,
            endMs: w.endMs,
            status: r.status,
            analysed: ok && r.body?.analysed === true,
            transcript: ok ? (r.body?.transcript ?? null) : null,
            error: ok ? null : (r.body?.code ?? r.body?.title ?? `HTTP ${r.status}`),
            call: r.call,
          });
          if (r.status === 409 || r.status === 404) break; // consent missing or the interaction ended: later windows would fail the same way
        }
        send({ type: "done", windows: cut.windows.length, analysed });
      } catch {
        send({ type: "error", code: "UNREACHABLE", message: "The module could not be reached" });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { status: 200, headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" } });
});
