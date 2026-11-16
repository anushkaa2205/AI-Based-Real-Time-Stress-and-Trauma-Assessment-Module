"use client";

/**
 * Alert banner on every staff page (task 5.6, FR-ALR-01/02/04, AC-ALR-01).
 * Critical: red banner + short sound, until a named responder acknowledges.
 * High: quieter notice. Polls every 10 s (fallback when real time is down);
 * each poll also lets the server run due jobs (escalations).
 */
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRealtime } from "@/components/realtime/realtime-provider";

interface AlertItem {
  id: string;
  caseId: string;
  docketNumber: string;
  level: "CRITICAL" | "HIGH";
  reason: string;
  escalationLevel: number;
  createdAt: string;
}

const POLL_MS = 10_000;
/** The banner stays compact: the most urgent few, then a "+N more" toggle. */
const SHOWN = 3;

/** Critical first, then the newest (the one most likely still unseen). */
function byUrgency(a: AlertItem, b: AlertItem): number {
  if (a.level !== b.level) return a.level === "CRITICAL" ? -1 : 1;
  return b.createdAt.localeCompare(a.createdAt);
}

function beep() {
  try {
    const AudioCtx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 880;
    gain.gain.value = 0.15;
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.4);
  } catch {
    /* sound is a bonus; the banner is the alert */
  }
}

export function AlertBanner({ channels, caseHref }: { channels: string[]; caseHref: string | null }) {
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const heard = useRef(new Set<string>());

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/staff/alerts?status=OPEN", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { items: AlertItem[] };
      setAlerts([...data.items].sort(byUrgency));
      for (const a of data.items) {
        if (a.level === "CRITICAL" && !heard.current.has(a.id)) beep();
        heard.current.add(a.id);
      }
    } catch {
      /* offline: try again on the next tick */
    }
  }, []);

  useEffect(() => {
    // Defer the first load so it does not set state during the effect itself.
    const first = setTimeout(load, 0);
    const timer = setInterval(load, POLL_MS);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [load]);

  useRealtime(channels, (env) => {
    if (env.event.startsWith("alert.")) void load();
  });

  async function ack(id: string) {
    setBusy(id);
    await fetch(`/api/v1/staff/alerts/${id}/ack`, { method: "POST" }).catch(() => undefined);
    setBusy(null);
    void load();
  }

  if (!alerts.length) return null;
  const shown = expanded ? alerts : alerts.slice(0, SHOWN);
  const hidden = alerts.length - shown.length;
  return (
    <div className="flex max-h-[60vh] flex-col gap-2 overflow-y-auto border-b border-line bg-surface-2 px-4 py-3 md:px-7" aria-live="assertive">
      {shown.map((a) => (
        <div
          key={a.id}
          role="alert"
          data-testid={`alert-${a.level}`}
          className={`flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-line border-l-[6px] bg-white px-4 py-2.5 ${a.level === "CRITICAL" ? "border-l-danger" : "border-l-[#c4511a]"}`}
        >
          <strong className={`text-sm uppercase tracking-wide ${a.level === "CRITICAL" ? "text-danger" : "text-[#7a2e0b]"}`}>{a.level === "CRITICAL" ? "Critical alert" : "High risk"}</strong>
          <span className="num text-sm font-semibold">{a.docketNumber}</span>
          <span className="min-w-40 flex-1 text-sm text-ink-2">{a.reason}</span>
          {a.escalationLevel > 0 && <span className="tag border-line">Escalated (level {a.escalationLevel})</span>}
          {caseHref && (
            <Link href={`${caseHref}/${a.caseId}`} className="link text-sm font-semibold">
              Open case
            </Link>
          )}
          <button
            type="button"
            onClick={() => ack(a.id)}
            disabled={busy === a.id}
            className={`btn btn-sm ${a.level === "CRITICAL" ? "btn-danger" : "btn-primary"}`}
          >
            Acknowledge
          </button>
        </div>
      ))}
      {(hidden > 0 || expanded) && alerts.length > SHOWN && (
        <button type="button" data-testid="alerts-toggle" onClick={() => setExpanded(!expanded)} className="link self-start text-sm">
          {expanded ? "Show fewer alerts" : `+${hidden} more open alert${hidden === 1 ? "" : "s"}`}
        </button>
      )}
    </div>
  );
}
