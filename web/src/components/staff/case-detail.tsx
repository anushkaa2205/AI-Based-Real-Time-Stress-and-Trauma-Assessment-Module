"use client";

/**
 * Case detail for counsellors and supervisors (tasks 5.3–5.5, FR-CASE-03, FR-SVI-03/05,
 * FR-IND-04/05, FR-LANG-06). Evidence is highlighted in the original message; the
 * translation is shown under it. Updates live when the interaction changes.
 */
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useRealtime } from "@/components/realtime/realtime-provider";
import { BandBadge } from "./band-badge";
import { PageHeader } from "./page-header";
import { RecommendationActions } from "./recommendation-actions";
import { useEnumLabel } from "./use-labels";

/** Appendix A, step 3: 0–29 Low · 30–54 Moderate · 55–74 High · 75–100 Critical */
const THRESHOLDS = [30, 55, 75];

/** The score as a large number on a 0–100 bar marked with the band thresholds (plan §9.6). */
function ScoreBar({ svi, band }: { svi: number | null; band: string | null }) {
  const colour = band === "CRITICAL" ? "bg-[#b42318]" : band === "HIGH" ? "bg-[#c4511a]" : band === "MODERATE" ? "bg-[#b7860b]" : "bg-ink-3";
  return (
    <div className="flex items-center gap-4">
      <span className="num text-4xl font-medium leading-none text-ink" data-testid="svi">
        {svi ?? "–"}
      </span>
      <div className="flex-1">
        <div className="relative h-2.5 overflow-hidden rounded-full bg-surface-2">
          {svi !== null && <div className={`h-full rounded-full ${colour}`} style={{ width: `${Math.max(2, Math.min(100, svi))}%` }} />}
          {THRESHOLDS.map((t) => (
            <span key={t} aria-hidden className="absolute top-0 h-full w-px bg-ink/25" style={{ left: `${t}%` }} />
          ))}
        </div>
        <div className="num relative mt-1 h-4 text-[0.6875rem] text-ink-3">
          <span className="absolute left-0">0</span>
          {THRESHOLDS.map((t) => (
            <span key={t} className="absolute -translate-x-1/2" style={{ left: `${t}%` }}>
              {t}
            </span>
          ))}
          <span className="absolute right-0">100</span>
        </div>
      </div>
    </div>
  );
}


type Json = Record<string, unknown>;
interface Dim {
  score: number;
  confidence: number;
  contribution: number;
  bySource: Record<string, number>;
}
interface Assessment {
  id: string;
  seq: number;
  svi: number;
  band: string;
  computedBand?: string;
  overridesFired?: string[];
  dimensions?: Record<string, Dim>;
  confidence?: number;
  limitedConfidence?: boolean;
  topEvidence?: { dimension: string; label: string }[];
  explanation?: string;
  createdAt: string;
}
interface Indicator {
  id: string;
  dimension: string;
  source: string;
  score: number;
  confidence: number;
  negated: boolean;
  status: string;
  flags: string[];
  label: string | null;
  evidence: { type: string; messageId?: string; spanStart?: number; spanEnd?: number; quote?: string | null };
  review: { score: number | null; reason: string; by: { name: string }; at: string } | null;
}
interface Msg {
  id: string;
  seq: number;
  sender: string;
  text: string;
  translation: string | null;
  language: string | null;
  emotion: { label: string; confidence: number } | null;
  createdAt: string;
}
interface FollowUp {
  id: string;
  dueAt: string;
  channel: string;
  status: string;
  assignedTo: { name: string } | null;
}
interface CaseDetail {
  id: string;
  docketNumber: string;
  isPortal?: boolean;
  status: string;
  band: string | null;
  svi: number | null;
  overrideLockedBand: string | null;
  summary?: string | null;
  summaryTranslated?: string | null;
  consent: { textAnalysis: boolean; voiceAnalysis: boolean; shareWithCounsellor: boolean; followUpContact: boolean };
  context?: Json;
  interactions: { id: string; channel: string; startedAt: string; endedAt: string | null; status: string }[];
  latestAssessment: Assessment | null;
  recommendations: {
    id: string;
    type: string;
    reason: string;
    urgency: string;
    status: string;
    responsibleRole: string;
    legalBasis?: string;
    decision?: { by: { name: string }; at: string; reason?: string };
    referralId?: string;
  }[];
  openAlerts: { id: string; level: string; createdAt: string }[];
  bandOverrides: { fromBand: string; toBand: string; reason: string; by: { name: string } | null; at: string }[];
  assignedTo: { id: string; name: string } | null;
}


async function getJson<T>(url: string): Promise<{ ok: boolean; status: number; data: T | null }> {
  const res = await fetch(url, { cache: "no-store" });
  return { ok: res.ok, status: res.status, data: res.ok ? ((await res.json()) as T) : null };
}

async function send(method: string, url: string, body: unknown) {
  const res = await fetch(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = (await res.json().catch(() => ({}))) as Json;
  return { ok: res.ok, data };
}

function Highlighted({ text, spans }: { text: string; spans: { start: number; end: number; dim: string; negated: boolean }[] }) {
  const e = useEnumLabel();
  const t = useTranslations("staff.case");
  const sorted = [...spans].filter((s) => s.end <= text.length).sort((a, b) => a.start - b.start);
  const parts: React.ReactNode[] = [];
  let pos = 0;
  for (const s of sorted) {
    if (s.start < pos) continue; // overlapping span: keep the first
    parts.push(text.slice(pos, s.start));
    parts.push(
      <mark key={`${s.start}-${s.dim}`} title={`${e("dimensions", s.dim)}${s.negated ? ` (${t("negatedShort")})` : ""}`} className={s.negated ? "bg-surface-2 line-through decoration-ink-3" : "rounded-sm bg-[#fbe8b4] px-0.5 text-ink"}>
        {text.slice(s.start, s.end)}
      </mark>,
    );
    pos = s.end;
  }
  parts.push(text.slice(pos));
  return <>{parts}</>;
}

function Timeline({ points }: { points: Assessment[] }) {
  const t = useTranslations("staff.case");
  if (points.length < 2) return null;
  const w = 320;
  const h = 70;
  const xs = (i: number) => (i / (points.length - 1)) * (w - 10) + 5;
  const ys = (v: number) => h - 5 - (v / 100) * (h - 10);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-20 w-full max-w-sm" role="img" aria-label={t("sviOverTime", { values: points.map((p) => p.svi).join(", ") })}>
      {THRESHOLDS.map((t) => (
        <line key={t} x1="0" x2={w} y1={ys(t)} y2={ys(t)} stroke="currentColor" strokeOpacity="0.12" />
      ))}
      <polyline fill="none" stroke="var(--brand)" strokeWidth="2" strokeLinejoin="round" points={points.map((p, i) => `${xs(i)},${ys(p.svi)}`).join(" ")} />
      {points.map((p, i) => (
        <circle key={p.id} cx={xs(i)} cy={ys(p.svi)} r="2.5" fill="var(--brand)" />
      ))}
    </svg>
  );
}

export function CaseDetailView({ caseId }: { caseId: string }) {
  const [c, setC] = useState<CaseDetail | null>(null);
  const [timeline, setTimeline] = useState<Assessment[]>([]);
  const [indicators, setIndicators] = useState<Indicator[]>([]);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [noShare, setNoShare] = useState(false);
  const [notes, setNotes] = useState<{ id: string; body: string; author: { name: string } | null; createdAt: string }[]>([]);
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [review, setReview] = useState<{ id: string; action: string } | null>(null);
  const t = useTranslations("staff.case");
  const tc = useTranslations("staff.common");
  const e = useEnumLabel();

  const load = useCallback(async () => {
    const r = await getJson<CaseDetail>(`/api/v1/staff/cases/${caseId}`);
    if (!r.data) {
      setMsg(r.status === 403 ? t("noAccess") : t("loadFailed"));
      return;
    }
    // Everything is set together after all requests finish, so no section shows "empty" while loading.
    const iids = r.data.interactions.map((i) => i.id);
    const [tl, ind, tr, nt, fu] = await Promise.all([
      Promise.all(iids.map((i) => getJson<{ items: Assessment[] }>(`/api/v1/staff/interactions/${i}/assessments`))),
      Promise.all(iids.map((i) => getJson<{ items: Indicator[] }>(`/api/v1/staff/interactions/${i}/indicators`))),
      Promise.all(iids.map((i) => getJson<{ items: Msg[] }>(`/api/v1/staff/interactions/${i}/transcript`))),
      getJson<{ items: typeof notes }>(`/api/v1/staff/cases/${caseId}/notes`),
      getJson<{ items: FollowUp[] }>(`/api/v1/staff/follow-ups?caseId=${caseId}&status=SCHEDULED`),
    ]);
    setC(r.data);
    setTimeline(tl.flatMap((x) => x.data?.items ?? []));
    setIndicators(ind.flatMap((x) => x.data?.items ?? []));
    setMessages(tr.flatMap((x) => x.data?.items ?? []));
    setNoShare(tr.some((x) => x.status === 403));
    setNotes(nt.data?.items ?? []);
    setFollowUps(fu.data?.items ?? []);
  }, [caseId, t]);

  useEffect(() => {
    const first = setTimeout(load, 0);
    return () => clearTimeout(first);
  }, [load]);

  const channels = useMemo(() => (c ? c.interactions.map((i) => `private-interaction-${i.id}`) : []), [c]);
  useRealtime(channels, (env) => {
    if (["assessment.updated", "transcript.appended", "recommendation.created"].includes(env.event)) void load();
  });

  const spansByMessage = useMemo(() => {
    const m = new Map<string, { start: number; end: number; dim: string; negated: boolean }[]>();
    for (const i of indicators) {
      if (i.evidence.type !== "TEXT_SPAN" || !i.evidence.messageId || i.status === "REJECTED") continue;
      const list = m.get(i.evidence.messageId) ?? [];
      list.push({ start: i.evidence.spanStart ?? 0, end: i.evidence.spanEnd ?? 0, dim: i.dimension, negated: i.negated });
      m.set(i.evidence.messageId, list);
    }
    return m;
  }, [indicators]);

  async function submitReview(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!review) return;
    const f = new FormData(e.currentTarget);
    const body: Json = { action: review.action, reason: String(f.get("reason") ?? "") };
    if (review.action === "ADJUST") body.score = Number(f.get("score"));
    const r = await send("PATCH", `/api/v1/staff/indicators/${review.id}`, body);
    setMsg(r.ok ? t("reviewSaved") : t("reviewFailed"));
    setReview(null);
    void load();
  }

  async function override(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget; // keep the element: currentTarget is null after an await
    const f = new FormData(form);
    const r = await send("POST", `/api/v1/staff/cases/${caseId}/band-override`, { toBand: f.get("toBand"), reason: String(f.get("reason") ?? "") });
    setMsg(r.ok ? t("bandChanged") : t("overrideFailed"));
    if (r.ok) form.reset();
    void load();
  }

  async function addNote(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const r = await send("POST", `/api/v1/staff/cases/${caseId}/notes`, { body: String(new FormData(form).get("body") ?? "") });
    if (r.ok) form.reset();
    else setMsg(t("noteFailed"));
    void load();
  }

  async function scheduleFollowUp(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const local = String(f.get("dueAt") ?? "");
    if (!local) return setMsg(t("pickDate"));
    const r = await send("POST", `/api/v1/staff/cases/${caseId}/follow-ups`, { dueAt: new Date(local).toISOString(), channel: f.get("channel") });
    setMsg(r.ok ? t("followUpScheduled") : t("followUpFailed"));
    if (r.ok) form.reset();
    void load();
  }

  async function finishFollowUp(id: string, status: "DONE" | "CANCELLED") {
    const r = await send("PATCH", `/api/v1/staff/follow-ups/${id}`, { status });
    setMsg(r.ok ? t("followUpUpdated") : t("updateFailed"));
    void load();
  }

  async function patch(body: Json) {
    const r = await send("PATCH", `/api/v1/staff/cases/${caseId}`, body);
    setMsg(r.ok ? t("caseUpdated") : t("updateFailed"));
    void load();
  }

  if (!c)
    return msg ? (
      <p role="status" className="empty">
        {msg}
      </p>
    ) : (
      <div className="flex flex-col gap-4" aria-busy="true" aria-label={tc("loading")}>
        <div className="skeleton h-8 w-72" />
        <div className="skeleton h-24 w-full" />
        <div className="skeleton h-64 w-full" />
      </div>
    );
  const a = c.latestAssessment;
  const dims = Object.entries(a?.dimensions ?? {}).sort((x, y) => y[1].contribution - x[1].contribution);
  const active = indicators.filter((i) => i.status !== "REJECTED");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={c.docketNumber}>
        <BandBadge band={c.band} />
        {c.overrideLockedBand && <span className="tag tag-brand">{t("lockedAt", { band: e("bands", c.overrideLockedBand) })}</span>}
        {a?.limitedConfidence && <span className="tag tag-warn">{t("limited")}</span>}
        <span className="tag">{e("status", c.status)}</span>
        <span className="text-sm text-ink-2">{c.assignedTo ? t("assignedTo", { name: c.assignedTo.name }) : t("unassigned")}</span>
      </PageHeader>
      {msg && (
        <p role="status" data-testid="case-message" className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink-2">
          {msg}
        </p>
      )}

      <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="card card-pad flex flex-col gap-4">
          <h2 className="section-title">{t("sviTitle")}</h2>
          <ScoreBar svi={c.svi} band={c.band} />
          <p className="text-[0.9375rem] leading-relaxed text-ink" data-testid="explanation">
            {a?.explanation ?? t("noAssessment")}
          </p>
          {!!a?.overridesFired?.length && (
            <p className="flex flex-wrap items-center gap-1.5 text-sm">
              <span className="text-ink-2">{t("overrides")}</span>
              {a.overridesFired.map((o) => (
                <span key={o} className="tag tag-danger">
                  {o}
                </span>
              ))}
            </p>
          )}
          <Timeline points={timeline} />
          {c.summary && (
            <div className="border-t border-line pt-3">
              <h3 className="section-title">{t("summary")}</h3>
              <p className="mt-1 text-sm leading-relaxed">{c.summary}</p>
              {c.summaryTranslated && c.summaryTranslated !== c.summary && <p className="mt-1 text-sm text-ink-2">{c.summaryTranslated}</p>}
            </div>
          )}
        </div>
        <div className="card card-pad flex flex-col gap-3">
          <h2 className="section-title">{t("drivers")}</h2>
          {dims.length === 0 && <p className="text-sm text-ink-3">{t("noSignal")}</p>}
          {dims.map(([k, d]) => (
            <div key={k} className="text-sm">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-medium text-ink">{e("dimensions", k)}</span>
                <span className="num text-ink-2">
                  +{d.contribution.toFixed(1)} <span className="text-ink-3">· {d.score.toFixed(2)}</span>
                </span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2">
                <div className="h-full rounded-full bg-brand" style={{ width: `${Math.min(100, d.score * 100)}%` }} />
              </div>
              <div className="mt-0.5 text-xs text-ink-3">
                {Object.entries(d.bySource)
                  .map(([s, v]) => `${e("sources", s)} ${v.toFixed(2)}`)
                  .join(" · ") || t("noSignalShort")}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="card card-pad flex flex-col gap-3">
          <div className="flex items-baseline justify-between">
            <h2 className="section-title">{t("warningSigns")}</h2>
            <span className="text-xs text-ink-3">{t("activeCount", { n: active.length })}</span>
          </div>
          {indicators.length === 0 && <p className="text-sm text-ink-3">{noShare ? t("notShared") : t("noWarnings")}</p>}
          <ul className="flex flex-col gap-2">
            {indicators.map((i) => (
              <li key={i.id} className={`rounded-lg border border-line p-3 text-sm ${i.status === "REJECTED" || i.negated ? "opacity-60" : ""}`} data-testid="indicator">
                <div className="flex flex-wrap items-center gap-2">
                  <strong className="text-ink">{e("dimensions", i.dimension)}</strong>
                  <span className="num text-ink-2">{(i.review?.score ?? i.score).toFixed(2)}</span>
                  <span className="text-xs text-ink-3">
                    {e("sources", i.source)} · {t("confidence", { v: i.confidence.toFixed(2) })}
                    {i.negated ? ` · ${t("negated")}` : ""} · {e("indicatorStatus", i.status)}
                  </span>
                  {i.flags.length > 0 && <span className="tag tag-danger">{i.flags.join(", ")}</span>}
                </div>
                {i.evidence.quote && <q className="mt-1.5 block border-l-2 border-[#e9c75a] pl-2.5 italic text-ink">{i.evidence.quote}</q>}
                {i.label && <span className="mt-1 block text-xs text-ink-3">{i.label}</span>}
                {i.review && (
                  <span className="mt-1 block text-xs text-ink-2">
                    {t("reviewedBy", { name: i.review.by.name, reason: i.review.reason })}
                  </span>
                )}
                <div className="mt-2 flex gap-2">
                  {(["CONFIRM", "REJECT", "ADJUST"] as const).map((act) => (
                    <button key={act} type="button" className="btn btn-secondary btn-sm" onClick={() => setReview({ id: i.id, action: act })}>
                      {e("review", act)}
                    </button>
                  ))}
                </div>
                {review?.id === i.id && (
                  <form onSubmit={submitReview} className="mt-2 flex flex-wrap items-end gap-2">
                    {review.action === "ADJUST" && (
                      <label className="flex flex-col text-xs">
                        {t("newScore")}
                        <input name="score" type="number" min="0" max="1" step="0.05" required className="field w-20" />
                      </label>
                    )}
                    <label className="flex flex-1 flex-col text-xs">
                      {t("reasonRequired")}
                      <input name="reason" minLength={5} required className="field w-auto" />
                    </label>
                    <button type="submit" className="btn btn-primary btn-sm">
                      {t("save")}: {e("review", review.action)}
                    </button>
                    <button type="button" className="btn btn-quiet btn-sm" onClick={() => setReview(null)}>
                      {t("cancel")}
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        </div>

        <div className="card card-pad flex flex-col gap-3">
          <h2 className="section-title">{t("transcript")}</h2>
          {noShare && <p className="text-sm text-ink-3">{t("transcriptNoShare")}</p>}
          {!noShare && messages.length === 0 && <p className="text-sm text-ink-3">{t("nothingSaid")}</p>}
          <ol className="flex flex-col gap-3">
            {messages.map((m) => (
              <li key={m.id} className={`text-sm ${m.sender === "OPERATOR" ? "pl-3 border-l-2 border-line" : ""}`} data-testid="message">
                <div className="text-xs text-ink-3">
                  #{m.seq} · {e("senders", m.sender)} · {m.language ?? ""}
                  {m.emotion ? ` · ${m.emotion.label}` : ""} · {new Date(m.createdAt).toLocaleString()}
                </div>
                <p className="leading-relaxed text-ink">
                  <Highlighted text={m.text} spans={spansByMessage.get(m.id) ?? []} />
                </p>
                {m.translation && m.translation !== m.text && <p className="text-ink-2">EN: {m.translation}</p>}
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="card card-pad flex flex-col gap-3 text-sm">
          <h2 className="section-title">{t("proposedSupport")}</h2>
          {c.recommendations.length === 0 && <p className="text-ink-3">{t("nothingProposed")}</p>}
          <ul className="flex flex-col divide-y divide-line">
            {c.recommendations.map((r) => (
              <li key={r.id} className="flex flex-col gap-1.5 py-3 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-center gap-2">
                  <strong className="text-ink">{e("support", r.type)}</strong>
                  <span className={`tag ${r.urgency === "IMMEDIATE" || r.urgency === "WITHIN_15_MIN" ? "tag-danger" : ""}`}>{e("urgency", r.urgency)}</span>
                  <span className={`tag ${r.status === "APPROVED" || r.status === "AUTO_TRIGGERED" ? "tag-ok" : r.status === "REJECTED" ? "" : "tag-brand"}`}>{e("recStatus", r.status)}</span>
                  <span className="text-xs text-ink-3">{e("roles", r.responsibleRole)}</span>
                </div>
                <span className="text-xs text-ink-2">{r.reason}</span>
                {r.legalBasis && <span className="text-xs text-ink-3">{t("basis", { text: r.legalBasis })}</span>}
                <RecommendationActions
                  rec={r}
                  onDone={(m) => {
                    setMsg(m);
                    void load();
                  }}
                />
              </li>
            ))}
          </ul>
        </div>
        <div className="card card-pad flex flex-col gap-2 text-sm">
          <h2 className="section-title">{t("consentContext")}</h2>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5">
            {(
              [
                [t("consentText"), c.consent.textAnalysis],
                [t("consentVoice"), c.consent.voiceAnalysis],
                [t("consentShare"), c.consent.shareWithCounsellor],
                [t("consentFollowUp"), c.consent.followUpContact],
              ] as const
            ).map(([k, v]) => (
              <div key={k} className="flex items-center justify-between gap-2 border-b border-line py-1">
                <dt className="text-ink-2">{k}</dt>
                <dd className={`font-medium ${v ? "text-ok" : "text-ink-3"}`}>{v ? t("yes") : t("no")}</dd>
              </div>
            ))}
          </dl>
          {c.context && Object.keys(c.context).length > 0 && (
            <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5">
              {Object.entries(c.context).map(([k, v]) => (
                <div key={k} className="flex items-center justify-between gap-2 border-b border-line py-1">
                  <dt className="text-ink-2">{k}</dt>
                  <dd className="font-medium text-ink">{String(v)}</dd>
                </div>
              ))}
            </dl>
          )}
          <div className="mt-2 flex flex-wrap gap-1.5 text-xs text-ink-3">
            {c.interactions.map((i) => (
              <span key={i.id} className="tag">
                {e("channels", i.channel)} · {e("interactionStatus", i.status)}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <form onSubmit={override} className="card card-pad flex flex-col gap-3 text-sm" data-testid="override-form">
          <h2 className="section-title">{t("overrideTitle")}</h2>
          <p className="text-xs text-ink-3">{t("overrideHint")}</p>
          <div className="grid gap-2 sm:grid-cols-[10rem_1fr]">
            <select name="toBand" defaultValue={c.band ?? "LOW"} className="field" aria-label={t("newBand")}>
              {["LOW", "MODERATE", "HIGH", "CRITICAL"].map((b) => (
                <option key={b} value={b}>
                  {e("bands", b)}
                </option>
              ))}
            </select>
            <input name="reason" placeholder={t("reasonPlaceholder")} className="field" aria-label={t("reason")} />
          </div>
          <div>
            <button type="submit" className="btn btn-primary">
              {t("changeBand")}
            </button>
          </div>
          {c.bandOverrides.length > 0 && (
            <ul className="flex flex-col gap-1 border-t border-line pt-2 text-xs text-ink-2">
              {c.bandOverrides.map((o, i) => (
                <li key={i}>
                  {t("overrideBy", { from: e("bands", o.fromBand), to: e("bands", o.toBand), name: o.by?.name ?? "?", reason: o.reason })}
                </li>
              ))}
            </ul>
          )}
        </form>
        <div className="card card-pad flex flex-col gap-3 text-sm">
          <h2 className="section-title">{t("actionsNotes")}</h2>
          <div className="flex flex-wrap gap-2">
            {["UNDER_REVIEW", "ACTION_TAKEN", "CLOSED"].map((s) => (
              <button key={s} type="button" onClick={() => patch({ status: s })} className="btn btn-secondary btn-sm">
                {t("markAs", { status: e("status", s) })}
              </button>
            ))}
          </div>
          <form onSubmit={scheduleFollowUp} className="flex flex-wrap items-center gap-2" data-testid="followup-form">
            <label htmlFor="fu-due" className="text-xs text-ink-2">
              {t("followUp")}
            </label>
            <input id="fu-due" name="dueAt" type="datetime-local" className="field w-auto" />
            <select name="channel" defaultValue="VOICE_CALL" aria-label={t("followUpChannel")} className="field w-auto">
              {["VOICE_CALL", "CHATBOT", "PORTAL", "MOBILE_APP"].map((ch) => (
                <option key={ch} value={ch}>
                  {e("channels", ch)}
                </option>
              ))}
            </select>
            <button type="submit" className="btn btn-secondary btn-sm">
              {t("schedule")}
            </button>
          </form>
          {followUps.length > 0 && (
            <ul className="flex flex-col gap-1 text-xs" data-testid="followups">
              {followUps.map((f) => (
                <li key={f.id} className="flex flex-wrap items-center gap-2">
                  <span>
                    {new Date(f.dueAt).toLocaleString()} · {e("channels", f.channel)} · {f.assignedTo?.name ?? t("unassigned")}
                  </span>
                  <button type="button" className="link" onClick={() => finishFollowUp(f.id, "DONE")}>
                    {t("done")}
                  </button>
                  <button type="button" className="link" onClick={() => finishFollowUp(f.id, "CANCELLED")}>
                    {t("cancel")}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <form onSubmit={addNote} className="flex gap-2">
            <input name="body" required placeholder={t("addNote")} className="field flex-1" aria-label={t("note")} />
            <button type="submit" className="btn btn-primary">
              {t("save")}
            </button>
          </form>
          <ul className="flex flex-col gap-2">
            {notes.map((n) => (
              <li key={n.id} className="rounded-lg bg-surface-2 px-3 py-2">
                <span className="text-xs text-ink-3">
                  {n.author?.name} · {new Date(n.createdAt).toLocaleString()}
                </span>
                <p className="text-ink">{n.body}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
