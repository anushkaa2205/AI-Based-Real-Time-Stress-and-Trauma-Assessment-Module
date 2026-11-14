/**
 * GET /api/v1/realtime/stream?channels=a,b (task 5.1): server-sent events for
 * REALTIME_DRIVER=sse (local use without Pusher). Every channel is checked with
 * the same policies as Pusher sign-in. One Node process only.
 */
import { staffCanSubscribe } from "@/lib/realtime/authorize";
import type { Envelope } from "@/lib/realtime/channels";
import { sseBus } from "@/lib/realtime/publish";
import { env } from "@/lib/env";
import { ApiError } from "@/lib/problem";
import { route } from "@/lib/route";

export const dynamic = "force-dynamic";

export const GET = route({ auth: "staff", rateLimit: false }, async ({ req, user }) => {
  if (env().REALTIME_DRIVER !== "sse") throw new ApiError("NOT_FOUND");
  const channels = [...new Set((req.nextUrl.searchParams.get("channels") ?? "").split(",").filter(Boolean))].slice(0, 20);
  for (const c of channels) if (!(await staffCanSubscribe(user, c))) throw new ApiError("FORBIDDEN");

  const bus = sseBus();
  const encoder = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (env: Envelope) => controller.enqueue(encoder.encode(`id: ${env.id}\nevent: ${env.event}\ndata: ${JSON.stringify(env)}\n\n`));
      const listeners = channels.map((c) => {
        const fn = (env: Envelope) => send(env);
        bus.on(c, fn);
        return [c, fn] as const;
      });
      const ping = setInterval(() => controller.enqueue(encoder.encode(`: ping\n\n`)), 25_000);
      cleanup = () => {
        clearInterval(ping);
        for (const [c, fn] of listeners) bus.off(c, fn);
      };
      req.signal.addEventListener("abort", () => {
        cleanup();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      });
      controller.enqueue(encoder.encode(`: connected\n\n`));
    },
    cancel() {
      cleanup();
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-store", Connection: "keep-alive" },
  });
});
