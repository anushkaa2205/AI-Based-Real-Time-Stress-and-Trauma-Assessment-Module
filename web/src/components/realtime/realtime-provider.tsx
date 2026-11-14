"use client";

/**
 * Staff real-time subscriptions (task 5.1). Pusher in normal use; EventSource
 * against /api/v1/realtime/stream when REALTIME_DRIVER=sse. Payloads carry ids
 * and short summaries; screens re-fetch details over REST.
 * If real time is down, screens keep working through 10-second polling (FR-ALR, §10.3).
 */
import PusherJs from "pusher-js";
import { createContext, useContext, useEffect, useRef, type ReactNode } from "react";

export interface RealtimeConfig {
  driver: "pusher" | "sse";
  key?: string;
  cluster?: string;
}

export interface Envelope {
  event: string;
  id: string;
  at: string;
  data: unknown;
}

const Ctx = createContext<RealtimeConfig | null>(null);
let pusherSingleton: PusherJs | null = null;

export function RealtimeProvider({ config, children }: { config: RealtimeConfig; children: ReactNode }) {
  return <Ctx.Provider value={config}>{children}</Ctx.Provider>;
}

function pusherFor(cfg: RealtimeConfig): PusherJs {
  pusherSingleton ??= new PusherJs(cfg.key!, {
    cluster: cfg.cluster!,
    channelAuthorization: { endpoint: "/api/v1/realtime/auth", transport: "ajax" },
  });
  return pusherSingleton;
}

/** Calls `onEvent` for every event on the given channels. Duplicate deliveries are dropped by id. */
export function useRealtime(channels: string[], onEvent: (env: Envelope) => void): void {
  const cfg = useContext(Ctx);
  const handler = useRef(onEvent);
  useEffect(() => {
    handler.current = onEvent;
  }, [onEvent]);
  const key = channels.filter(Boolean).sort().join(",");

  useEffect(() => {
    if (!cfg || !key) return;
    const names = key.split(",");
    const seen = new Set<string>();
    const deliver = (env: Envelope) => {
      if (!env?.id || seen.has(env.id)) return;
      seen.add(env.id);
      if (seen.size > 500) seen.clear();
      handler.current(env);
    };

    if (cfg.driver === "pusher" && cfg.key && cfg.cluster) {
      const p = pusherFor(cfg);
      const subs = names.map((n) => {
        const ch = p.subscribe(n);
        const fn = (_eventName: string, data: unknown) => {
          if (data && typeof data === "object" && "event" in data) deliver(data as Envelope);
        };
        ch.bind_global(fn);
        return { n, ch, fn };
      });
      return () => {
        for (const s of subs) {
          s.ch.unbind_global(s.fn);
          p.unsubscribe(s.n);
        }
      };
    }

    const es = new EventSource(`/api/v1/realtime/stream?channels=${encodeURIComponent(key)}`);
    const onAny = (e: MessageEvent) => {
      try {
        deliver(JSON.parse(e.data) as Envelope);
      } catch {
        /* ignore malformed */
      }
    };
    const events = [
      "assessment.updated",
      "transcript.appended",
      "case.created",
      "case.updated",
      "alert.created",
      "alert.acknowledged",
      "alert.escalated",
      "recommendation.created",
    ];
    for (const ev of events) es.addEventListener(ev, onAny);
    return () => es.close();
  }, [cfg, key]);
}
