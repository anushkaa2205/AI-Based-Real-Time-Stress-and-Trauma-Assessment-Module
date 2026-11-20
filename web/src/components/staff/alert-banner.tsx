"use client";

/**
 * Alert banner on every staff page (task 5.6, FR-ALR-01/02/04, AC-ALR-01).
 * Critical: red banner + short sound, until a named responder acknowledges.
 * High: quieter notice. Polls every 10 s (fallback when real time is down);
 * each poll also lets the server run due jobs (escalations).
 */
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRealtime } from "@/components/realtime/realtime-provider";
import { decideBeep, readHeard, titleWithCount, writeHeard, type HeardMap } from "@/components/staff/alert-sound";

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

/** One audio context for the whole tab (H.6): browsers limit how many can be open. */
let audioCtx: AudioContext | null = null;

/** sessionStorage, or null where it is blocked (H.6). */
function tabStorage(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function beep() {
  try {
    const AudioCtx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    audioCtx ??= new AudioCtx();
    const ctx = audioCtx;
    if (ctx.state === "suspended") void ctx.resume().catch(() => undefined);
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
  const t = useTranslations("staff.alerts");
  const [busy, setBusy] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  // Alert id → escalation level already beeped for; kept per tab so a reload does not beep again (H.6).
  const heard = useRef<HeardMap | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/staff/alerts?status=OPEN", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { items: AlertItem[] };
      setAlerts([...data.items].sort(byUrgency));
      const storage = tabStorage();
      const decision = decideBeep(data.items, heard.current ?? readHeard(storage));
      heard.current = decision.heard;
      writeHeard(storage, decision.heard);
      if (decision.beep) beep();
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

  // Open Critical count in the tab title (H.7). Page navigation resets the title, so a watch on
  // <title> puts the count back; it only writes when the text differs, so it cannot loop.
  const criticalCount = alerts.filter((a) => a.level === "CRITICAL").length;
  useEffect(() => {
    const apply = () => {
      const want = titleWithCount(document.title, criticalCount);
      if (document.title !== want) document.title = want;
    };
    apply();
    const watch = new MutationObserver(apply);
    watch.observe(document.head, { subtree: true, childList: true, characterData: true });
    return () => {
      watch.disconnect();
      document.title = titleWithCount(document.title, 0);
    };
  }, [criticalCount]);

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
          <strong className={`text-sm uppercase tracking-wide ${a.level === "CRITICAL" ? "text-danger" : "text-[#7a2e0b]"}`}>{a.level === "CRITICAL" ? t("critical") : t("high")}</strong>
          <span className="num text-sm font-semibold">{a.docketNumber}</span>
          <span className="min-w-40 flex-1 text-sm text-ink-2">{a.reason}</span>
          {a.escalationLevel > 0 && <span className="tag border-line">{t("escalated", { level: a.escalationLevel })}</span>}
          {caseHref && (
            <Link href={`${caseHref}/${a.caseId}`} className="link text-sm font-semibold">
              {t("open")}
            </Link>
          )}
          <button
            type="button"
            onClick={() => ack(a.id)}
            disabled={busy === a.id}
            className={`btn btn-sm ${a.level === "CRITICAL" ? "btn-danger" : "btn-primary"}`}
          >
            {t("ack")}
          </button>
        </div>
      ))}
      {(hidden > 0 || expanded) && alerts.length > SHOWN && (
        <button type="button" data-testid="alerts-toggle" onClick={() => setExpanded(!expanded)} className="link self-start text-sm">
          {expanded ? t("fewer") : t("more", { count: hidden })}
        </button>
      )}
    </div>
  );
}
