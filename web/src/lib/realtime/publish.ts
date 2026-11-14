/**
 * Publishes real-time events AFTER the database transaction commits (task 5.1,
 * DATABASE §6), so staff never see an update that was rolled back.
 *
 *  - REALTIME_DRIVER=pusher: Pusher Channels (Vercel cannot hold sockets, ADR-6).
 *  - REALTIME_DRIVER=sse: an in-process bus streamed by /api/v1/realtime/stream
 *    (one Node process: local development and local production builds).
 *
 * Never throws: a failed publish is logged by type only; clients also poll.
 */
import { randomBytes } from "node:crypto";
import { EventEmitter } from "node:events";
import Pusher from "pusher";
import { env } from "@/lib/env";
import type { Envelope, OutboundEvent } from "./channels";

const g = globalThis as unknown as { _rtBus?: EventEmitter; _pusher?: Pusher };

/** In-process bus for the SSE driver. Listeners subscribe per channel name. */
export function sseBus(): EventEmitter {
  if (!g._rtBus) {
    g._rtBus = new EventEmitter();
    g._rtBus.setMaxListeners(1000);
  }
  return g._rtBus;
}

function pusher(): Pusher {
  const e = env();
  g._pusher ??= new Pusher({
    appId: e.PUSHER_APP_ID!,
    key: e.PUSHER_KEY!,
    secret: e.PUSHER_SECRET!,
    cluster: e.PUSHER_CLUSTER!,
    useTLS: true,
  });
  return g._pusher;
}

export function pusherClient(): Pusher {
  return pusher();
}

export function envelope(ev: OutboundEvent, at: Date = new Date()): Envelope {
  return { event: ev.event, id: `evt_${randomBytes(9).toString("base64url")}`, at: at.toISOString(), data: ev.data };
}

export async function publish(events: readonly OutboundEvent[]): Promise<void> {
  if (!events.length) return;
  try {
    if (env().REALTIME_DRIVER === "sse") {
      const bus = sseBus();
      for (const ev of events) bus.emit(ev.channel, envelope(ev));
      return;
    }
    // Pusher allows up to 10 events per batch call.
    const batch = events.map((ev) => ({ channel: ev.channel, name: ev.event, data: envelope(ev) }));
    for (let i = 0; i < batch.length; i += 10) await pusher().triggerBatch(batch.slice(i, i + 10));
  } catch (err) {
    console.error(`[realtime] publish failed: ${(err as Error)?.name ?? "Error"}`);
  }
}
