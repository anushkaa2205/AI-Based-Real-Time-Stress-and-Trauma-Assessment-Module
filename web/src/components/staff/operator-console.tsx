"use client";

/**
 * Operator assist console (tasks 7.5, 7.7; FR-CH-04, FR-DSH-01, FR-EMO-03, AC-CH-02).
 *
 * Left: live sessions; "Take call" makes it the operator's own call.
 * Right, for the selected call: live transcript, SVI gauge, indicator chips with evidence,
 * pause and pitch strip per voice window, emotion timeline (text / voice / fused),
 * suggested next questions (scripted), and "type what the caller said".
 * Everything refreshes on real-time events for that interaction.
 */
import { Mic } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useRealtime } from "@/components/realtime/realtime-provider";
import { DemoMark } from "./demo-mark";
import { BandBadge } from "./band-badge";
import { useEnumLabel } from "./use-labels";

interface Live {
  id: string;
  docketNumber: string;
  isDemo?: boolean;
  channel: string;
  language: string;
  startedAt: string;
  operator: { id: string; name: string } | null;
  band: string | null;
  svi: number | null;
}
interface Msg {
  id: string;
  seq: number;
  sender: string;
  modality?: string;
  text: string;
  translation: string | null;
}
interface Ind {
  id: string;
  dimension: string;
  source: string;
  score: number;
  negated: boolean;
  status: string;
  label: string | null;
  evidence: { type: string; quote?: string | null; eventType?: string };
}
interface Win {
  windowIndex: number;
  startMs: number;
  pauses: { count: number; maxMs: number; silenceRatio: number };
  pitch: { meanHz: number; stdHz: number } | null;
  speechRateWpm: number | null;
  events: { type: string }[];
  emotion: { label: string; confidence: number } | null;
}
interface EmoPoint {
  atMs: number;
  text: { label: string; confidence: number } | null;
  voice: { label: string; confidence: number } | null;
  fused: { label: string; confidence: number } | null;
}
interface Suggestion {
  key: string;
  text: string;
  textEn: string;
  reason: string;
}

const EMO_COLOR: Record<string, string> = {
  fear: "bg-[#e9e3f3] text-[#3b2d5c]",
  sadness: "bg-[#e1e8f1] text-[#263c5a]",
  anger: "bg-[#f6dcdc] text-[#6e1012]",
  flat: "bg-[#e7e5e0] text-[#3d4753]",
  shame: "bg-[#f3e8cf] text-[#4a3700]",
  shock: "bg-[#f8e1d2] text-[#6b2a0d]",
  neutral: "bg-surface-2 text-foreground",
};

async function getJson<T>(url: string): Promise<T | null> {
  const r = await fetch(url, { cache: "no-store" }).catch(() => null);
  return r?.ok ? ((await r.json()) as T) : null;
}

function Gauge({ svi, band }: { svi: number | null; band: string | null }) {
  const t = useTranslations("staff.operator");
  const v = Math.max(0, Math.min(100, svi ?? 0));
  return (
    <div className="flex flex-col gap-1" data-testid="svi-gauge" data-svi={svi ?? ""}>
      <div className="flex items-baseline gap-2">
        <span className="text-4xl font-bold tabular-nums">{svi ?? "–"}</span>
        <span className="text-sm text-ink-3">{t("svi")}</span>
        <BandBadge band={band} />
      </div>
      <div className="relative h-3 w-full rounded bg-surface-2" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={v} aria-label={t("svi")}>
        {[30, 55, 75].map((t) => (
          <span key={t} className="absolute top-0 h-3 w-px bg-foreground/40" style={{ left: `${t}%` }} />
        ))}
        <span className="absolute left-0 top-0 h-3 rounded bg-foreground" style={{ width: `${v}%` }} />
      </div>
    </div>
  );
}

function VoiceStrip({ windows }: { windows: Win[] }) {
  const t = useTranslations("staff.operator");
  if (!windows.length) return <p className="text-sm text-ink-3">{t("noVoice")}</p>;
  const last = windows.slice(-24);
  const pitches = last.map((w) => w.pitch?.meanHz ?? 0).filter((x) => x > 0);
  const lo = Math.min(...pitches, 400);
  const hi = Math.max(...pitches, 80);
  return (
    <div className="flex flex-col gap-2" data-testid="voice-strip">
      <div className="flex items-end gap-1" aria-label={t("pitchAria")}>
        {last.map((w) => {
          const h = w.pitch ? 8 + (36 * (w.pitch.meanHz - lo)) / Math.max(1, hi - lo) : 4;
          return (
            <div key={w.windowIndex} className="flex w-6 flex-col items-center gap-0.5" title={t("windowTitle", { n: w.windowIndex, hz: w.pitch?.meanHz ?? "–", sd: w.pitch?.stdHz ?? "–", pauses: w.pauses.count, longest: (w.pauses.maxMs / 1000).toFixed(1), wpm: w.speechRateWpm ?? "–" })}>
              <span className="w-3 rounded-t bg-foreground/70" style={{ height: `${h}px` }} />
              <span className="w-3 rounded-[1px] bg-brand" style={{ height: `${Math.round(w.pauses.silenceRatio * 16) + 1}px` }} />
            </div>
          );
        })}
      </div>
      <p className="text-xs text-ink-3">{t("barsHint")}</p>
      {last.at(-1) && (
        <p className="text-sm">
          {t("latest", { pauses: last.at(-1)!.pauses.count, longest: (last.at(-1)!.pauses.maxMs / 1000).toFixed(1), wpm: last.at(-1)!.speechRateWpm ?? "–" })}
          {last.at(-1)!.events.length ? ` · ${last.at(-1)!.events.map((e) => e.type.toLowerCase().replace(/_/g, " ")).join(", ")}` : ""}
        </p>
      )}
    </div>
  );
}

function EmotionTimeline({ points }: { points: EmoPoint[] }) {
  const t = useTranslations("staff.operator");
  const en = useTranslations("staff.enums.emotions");
  const emo = (label: string) => (en.has(label) ? en(label) : label);
  if (!points.length) return <p className="text-sm text-ink-3">{t("noEmotion")}</p>;
  const rows: [string, keyof EmoPoint][] = [
    [t("rowText"), "text"],
    [t("rowVoice"), "voice"],
    [t("rowFused"), "fused"],
  ];
  return (
    <div className="flex flex-col gap-1 overflow-x-auto text-xs" data-testid="emotion-timeline">
      {rows.map(([label, key]) => (
        <div key={key} className="flex items-center gap-1">
          <span className="w-12 shrink-0 text-ink-3">{label}</span>
          {points.map((p, i) => {
            const e = p[key] as EmoPoint["text"];
            return (
              <span key={i} title={e ? t("emotionAt", { label: emo(e.label), pct: Math.round(e.confidence * 100), s: Math.round(p.atMs / 1000) }) : t("noSignal")} className={`min-w-12 rounded px-1 text-center ${e ? (EMO_COLOR[e.label] ?? "bg-surface-2") : "text-ink-3"}`}>
                {e ? emo(e.label) : "·"}
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function CallView({ live, onMessage }: { live: Live; onMessage: (m: string) => void }) {
  const id = live.id;
  const [svi, setSvi] = useState<{ svi: number | null; band: string | null }>({ svi: live.svi, band: live.band });
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [inds, setInds] = useState<Ind[]>([]);
  const [wins, setWins] = useState<Win[]>([]);
  const [emos, setEmos] = useState<EmoPoint[]>([]);
  const [sugs, setSugs] = useState<Suggestion[]>([]);
  const [busy, setBusy] = useState(false);
  const t = useTranslations("staff.operator");
  const e = useEnumLabel();

  const load = useCallback(async () => {
    const [cur, tr, ind, v, em, sg] = await Promise.all([
      getJson<{ svi: number; band: string }>(`/api/v1/staff/interactions/${id}/assessments/current`),
      getJson<{ items: Msg[] }>(`/api/v1/staff/interactions/${id}/transcript`),
      getJson<{ items: Ind[] }>(`/api/v1/staff/interactions/${id}/indicators`),
      getJson<{ items: Win[] }>(`/api/v1/staff/interactions/${id}/voice`),
      getJson<{ items: EmoPoint[] }>(`/api/v1/staff/interactions/${id}/emotions`),
      getJson<{ items: Suggestion[] }>(`/api/v1/staff/interactions/${id}/suggested-questions`),
    ]);
    if (cur) setSvi({ svi: cur.svi, band: cur.band });
    setMsgs(tr?.items ?? []);
    setInds((ind?.items ?? []).filter((i) => !i.negated && i.status !== "REJECTED"));
    setWins(v?.items ?? []);
    setEmos(em?.items ?? []);
    setSugs(sg?.items ?? []);
  }, [id]);

  useEffect(() => {
    const first = setTimeout(load, 0);
    return () => clearTimeout(first);
  }, [load]);

  const channels = useMemo(() => [`private-interaction-${id}`], [id]);
  useRealtime(channels, (env) => {
    if (env.event === "assessment.updated") {
      const d = env.data as { svi?: number; band?: string };
      if (typeof d.svi === "number") setSvi({ svi: d.svi, band: d.band ?? null });
    }
    if (["assessment.updated", "transcript.appended", "voice.window"].includes(env.event)) void load();
  });

  async function typed(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const text = String(new FormData(form).get("text") ?? "").trim();
    if (!text) return;
    setBusy(true);
    const r = await fetch(`/api/v1/staff/interactions/${id}/operator-message`, {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() },
      body: JSON.stringify({ text }),
    }).catch(() => null);
    setBusy(false);
    if (r?.ok) {
      form.reset();
      void load();
    } else onMessage(t("addFailed"));
  }

  const topInds = [...inds].sort((a, b) => b.score - a.score).slice(0, 12);
  return (
    <div className="flex flex-col gap-4" data-testid="call-view">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 num text-xl font-semibold">
            {live.docketNumber} <DemoMark show={live.isDemo} />
          </h2>
          <p className="text-xs text-ink-3">
            {e("channels", live.channel)} · {live.language}
          </p>
        </div>
        <div className="w-64">
          <Gauge svi={svi.svi} band={svi.band} />
        </div>
      </div>

      <section className="card card-pad">
        <h3 className="section-title mb-2">{t("suggested")}</h3>
        <ol className="flex flex-col gap-2" data-testid="suggestions">
          {sugs.map((s) => (
            <li key={s.key} className="text-sm">
              <p className="font-medium">{s.text}</p>
              {s.text !== s.textEn && <p className="text-xs text-ink-3">{s.textEn}</p>}
              <p className="text-xs text-ink-3">{t("why", { reason: s.reason })}</p>
            </li>
          ))}
        </ol>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card card-pad flex flex-col gap-2">
          <h3 className="section-title">{t("liveTranscript")}</h3>
          <ol className="flex max-h-80 flex-col gap-2 overflow-y-auto text-sm" data-testid="live-transcript" aria-live="polite">
            {msgs.map((m) => (
              <li key={m.id}>
                <span className="text-xs text-ink-3">
                  #{m.seq} {m.modality === "VOICE_TRANSCRIPT" ? <Mic className="inline size-3" aria-label={t("spoken")} /> : null}
                </span>{" "}
                {m.text}
                {m.translation && <span className="block text-xs text-ink-3">EN: {m.translation}</span>}
              </li>
            ))}
            {!msgs.length && <li className="text-ink-3">{t("nothingYet")}</li>}
          </ol>
          <form onSubmit={typed} className="flex gap-2">
            <label htmlFor="op-text" className="sr-only">
              {t("typeCaller")}
            </label>
            <input id="op-text" name="text" maxLength={2000} placeholder={t("typeCaller")} className="field flex-1" />
            <button type="submit" disabled={busy} className="btn btn-primary">
              {t("add")}
            </button>
          </form>
        </section>

        <section className="card card-pad flex flex-col gap-2">
          <h3 className="text-sm font-semibold">{t("indicators")}</h3>
          <ul className="flex flex-wrap gap-1" data-testid="indicator-chips">
            {topInds.map((i) => (
              <li
                key={i.id}
                className="tag border-line bg-white"
                title={i.evidence.quote ? `"${i.evidence.quote}"` : (i.label ?? i.evidence.eventType ?? "")}
              >
                {e("dimensions", i.dimension)} {i.score.toFixed(2)} · {e("sources", i.source)}
              </li>
            ))}
            {!topInds.length && <li className="text-sm text-ink-3">{t("noneYet")}</li>}
          </ul>
          <h3 className="mt-2 text-sm font-semibold">{t("voicePitch")}</h3>
          <VoiceStrip windows={wins} />
        </section>
      </div>

      <section className="card card-pad">
        <h3 className="section-title mb-2">{t("emotionTitle")}</h3>
        <EmotionTimeline points={emos} />
      </section>
    </div>
  );
}

export function OperatorConsole({ me, queueChannels }: { me: string; queueChannels: string[] }) {
  const [live, setLive] = useState<Live[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const t = useTranslations("staff.operator");
  const tc = useTranslations("staff.common");
  const e = useEnumLabel();

  const load = useCallback(async () => {
    const r = await getJson<{ items: Live[] }>("/api/v1/staff/interactions");
    setLive(r?.items ?? []);
  }, []);
  useEffect(() => {
    const first = setTimeout(load, 0);
    const timer = setInterval(load, 10_000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [load]);
  useRealtime(queueChannels, (env) => {
    if (env.event.startsWith("case.") || env.event === "assessment.updated") void load();
  });

  async function take(id: string) {
    const r = await fetch(`/api/v1/staff/interactions/${id}/claim`, { method: "POST" }).catch(() => null);
    const data = (await r?.json().catch(() => ({}))) as { detail?: string } | undefined;
    if (r?.ok) {
      setSelected(id);
      setMsg(null);
      void load();
    } else setMsg(data?.detail ?? t("takeFailed"));
  }

  const current = live?.find((l) => l.id === selected) ?? null;
  return (
    <div className="grid gap-6 xl:grid-cols-[18rem_1fr]">
      <aside className="flex flex-col gap-2">
        <h2 className="section-title">{t("liveSessions")}</h2>
        {msg && (
          <p role="status" className="text-sm text-danger">
            {msg}
          </p>
        )}
        {live === null && (
          <div className="skeleton h-16 w-full" role="status" aria-busy="true">
            <span className="sr-only">{tc("loading")}</span>
          </div>
        )}
        {live?.length === 0 && <div className="empty">{t("noLive")}</div>}
        <ul className="flex flex-col gap-2" data-testid="live-sessions">
          {live?.map((l) => {
            const mine = l.operator?.id === me;
            return (
              <li key={l.id} data-testid="live-row" className={`rounded-lg border bg-surface px-3 py-2.5 text-sm transition-colors ${selected === l.id ? "border-brand ring-2 ring-brand-soft" : "border-line"}`}>
                <div className="flex items-center gap-2">
                  <span className="num">{l.docketNumber}</span>
                  <DemoMark show={l.isDemo} />
                  <BandBadge band={l.band} />
                </div>
                <p className="text-xs text-ink-3">
                  {e("channels", l.channel)} · {l.language} · {l.operator ? t("with", { name: l.operator.name }) : t("unattended")}
                </p>
                {mine ? (
                  <button type="button" className="link mt-1" onClick={() => setSelected(l.id)}>
                    {t("open")}
                  </button>
                ) : (
                  !l.operator && (
                    <button type="button" className="btn btn-primary btn-sm mt-1" onClick={() => take(l.id)}>
                      {t("take")}
                    </button>
                  )
                )}
              </li>
            );
          })}
        </ul>
      </aside>
      <div>{current ? <CallView key={current.id} live={current} onMessage={setMsg} /> : <div className="empty">{t("takeHint")}</div>}</div>
    </div>
  );
}
