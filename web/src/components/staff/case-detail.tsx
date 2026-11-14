"use client";

/**
 * Case detail for counsellors and supervisors (tasks 5.3–5.5, FR-CASE-03, FR-SVI-03/05,
 * FR-IND-04/05, FR-LANG-06). Evidence is highlighted in the original message; the
 * translation is shown under it. Updates live when the interaction changes.
 */
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useRealtime } from "@/components/realtime/realtime-provider";
import { BandBadge } from "./band-badge";

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
interface CaseDetail {
  id: string;
  docketNumber: string;
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
  screenerScores?: { instrument: string; total: number; maxTotal: number; isPositive: boolean }[];
  recommendations: { id: string; type: string; reason: string; urgency: string; status: string; responsibleRole: string; legalBasis?: string }[];
  openAlerts: { id: string; level: string; createdAt: string }[];
  bandOverrides: { fromBand: string; toBand: string; reason: string; by: { name: string } | null; at: string }[];
  assignedTo: { id: string; name: string } | null;
}

const DIM_LABEL: Record<string, string> = {
  SUICIDAL_IDEATION: "Suicidal thoughts / self-harm",
  INTIMIDATION: "Intimidation / threat",
  SEVERE_TRAUMA: "Severe trauma",
  EXTREME_VULNERABILITY: "Extreme vulnerability",
  FEAR_ANXIETY: "Fear / anxiety",
  DEPRESSION: "Low mood",
  SOCIAL_ISOLATION: "Social isolation",
  ACUTE_STRESS: "Acute stress",
};

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
  const sorted = [...spans].filter((s) => s.end <= text.length).sort((a, b) => a.start - b.start);
  const parts: React.ReactNode[] = [];
  let pos = 0;
  for (const s of sorted) {
    if (s.start < pos) continue; // overlapping span: keep the first
    parts.push(text.slice(pos, s.start));
    parts.push(
      <mark key={`${s.start}-${s.dim}`} title={`${DIM_LABEL[s.dim] ?? s.dim}${s.negated ? " (negated)" : ""}`} className={s.negated ? "bg-muted line-through" : "bg-yellow-200"}>
        {text.slice(s.start, s.end)}
      </mark>,
    );
    pos = s.end;
  }
  parts.push(text.slice(pos));
  return <>{parts}</>;
}

function Timeline({ points }: { points: Assessment[] }) {
  if (points.length < 2) return null;
  const w = 320;
  const h = 70;
  const xs = (i: number) => (i / (points.length - 1)) * (w - 10) + 5;
  const ys = (v: number) => h - 5 - (v / 100) * (h - 10);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-20 w-full max-w-sm" role="img" aria-label={`SVI over time: ${points.map((p) => p.svi).join(", ")}`}>
      {[30, 55, 75].map((t) => (
        <line key={t} x1="0" x2={w} y1={ys(t)} y2={ys(t)} stroke="currentColor" strokeOpacity="0.15" />
      ))}
      <polyline fill="none" stroke="currentColor" strokeWidth="2" points={points.map((p, i) => `${xs(i)},${ys(p.svi)}`).join(" ")} />
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
  const [msg, setMsg] = useState<string | null>(null);
  const [review, setReview] = useState<{ id: string; action: string } | null>(null);

  const load = useCallback(async () => {
    const r = await getJson<CaseDetail>(`/api/v1/staff/cases/${caseId}`);
    if (!r.data) {
      setMsg(
        r.status === 403
          ? "You do not have access to this case. Counsellors can open cases assigned to them, or any case while on duty."
          : "Could not load the case.",
      );
      return;
    }
    // Everything is set together after all requests finish, so no section shows "empty" while loading.
    const iids = r.data.interactions.map((i) => i.id);
    const [tl, ind, tr, nt] = await Promise.all([
      Promise.all(iids.map((i) => getJson<{ items: Assessment[] }>(`/api/v1/staff/interactions/${i}/assessments`))),
      Promise.all(iids.map((i) => getJson<{ items: Indicator[] }>(`/api/v1/staff/interactions/${i}/indicators`))),
      Promise.all(iids.map((i) => getJson<{ items: Msg[] }>(`/api/v1/staff/interactions/${i}/transcript`))),
      getJson<{ items: typeof notes }>(`/api/v1/staff/cases/${caseId}/notes`),
    ]);
    setC(r.data);
    setTimeline(tl.flatMap((x) => x.data?.items ?? []));
    setIndicators(ind.flatMap((x) => x.data?.items ?? []));
    setMessages(tr.flatMap((x) => x.data?.items ?? []));
    setNoShare(tr.some((x) => x.status === 403));
    setNotes(nt.data?.items ?? []);
  }, [caseId]);

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
    setMsg(r.ok ? "Review saved; the SVI was recalculated." : String(r.data.detail ?? r.data.title ?? "Review failed"));
    setReview(null);
    void load();
  }

  async function override(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget; // keep the element: currentTarget is null after an await
    const f = new FormData(form);
    const r = await send("POST", `/api/v1/staff/cases/${caseId}/band-override`, { toBand: f.get("toBand"), reason: String(f.get("reason") ?? "") });
    setMsg(r.ok ? "Band changed." : String(r.data.detail ?? r.data.title ?? "Override failed"));
    if (r.ok) form.reset();
    void load();
  }

  async function addNote(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const r = await send("POST", `/api/v1/staff/cases/${caseId}/notes`, { body: String(new FormData(form).get("body") ?? "") });
    if (r.ok) form.reset();
    else setMsg("Could not save the note.");
    void load();
  }

  async function patch(body: Json) {
    const r = await send("PATCH", `/api/v1/staff/cases/${caseId}`, body);
    setMsg(r.ok ? "Case updated." : String(r.data.detail ?? r.data.title ?? "Update failed"));
    void load();
  }

  if (!c) return <p>{msg ?? "Loading…"}</p>;
  const a = c.latestAssessment;
  const dims = Object.entries(a?.dimensions ?? {}).sort((x, y) => y[1].contribution - x[1].contribution);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="font-mono text-2xl font-semibold">{c.docketNumber}</h1>
        <BandBadge band={c.band} />
        <span className="text-lg" data-testid="svi">
          SVI <strong>{c.svi ?? "–"}</strong>
        </span>
        {c.overrideLockedBand && <span className="rounded border border-border px-2 text-xs">Locked at {c.overrideLockedBand.toLowerCase()}</span>}
        {a?.limitedConfidence && <span className="rounded bg-muted px-2 text-xs">Limited AI analysis</span>}
        <span className="text-sm text-muted-foreground">Status: {c.status.replace(/_/g, " ").toLowerCase()}</span>
        <span className="text-sm text-muted-foreground">Assigned: {c.assignedTo?.name ?? "nobody"}</span>
      </header>
      {msg && (
        <p role="status" data-testid="case-message" className="rounded bg-muted p-2 text-sm">
          {msg}
        </p>
      )}

      <section className="grid gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-2 rounded-md border border-border p-4">
          <h2 className="font-semibold">Why this band</h2>
          <p data-testid="explanation">{a?.explanation ?? "No assessment yet."}</p>
          {!!a?.overridesFired?.length && <p className="text-sm">Safety overrides: {a.overridesFired.join(", ")}</p>}
          <Timeline points={timeline} />
          {c.summary && (
            <>
              <h3 className="mt-2 font-semibold">Summary</h3>
              <p className="text-sm">{c.summary}</p>
              {c.summaryTranslated && c.summaryTranslated !== c.summary && <p className="text-sm text-muted-foreground">{c.summaryTranslated}</p>}
            </>
          )}
        </div>
        <div className="flex flex-col gap-2 rounded-md border border-border p-4">
          <h2 className="font-semibold">SVI breakdown</h2>
          {dims.map(([k, d]) => (
            <div key={k} className="text-sm">
              <div className="flex justify-between">
                <span>{DIM_LABEL[k] ?? k}</span>
                <span className="font-mono">
                  +{d.contribution.toFixed(1)} (score {d.score.toFixed(2)})
                </span>
              </div>
              <div className="h-2 rounded bg-muted">
                <div className="h-2 rounded bg-foreground/70" style={{ width: `${Math.min(100, d.score * 100)}%` }} />
              </div>
              <div className="text-xs text-muted-foreground">
                {Object.entries(d.bySource)
                  .map(([s, v]) => `${s.toLowerCase().replace("_", " ")} ${v.toFixed(2)}`)
                  .join(" · ") || "no signal"}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-2 rounded-md border border-border p-4">
        <h2 className="font-semibold">Indicators</h2>
        {indicators.length === 0 && <p className="text-sm text-muted-foreground">{noShare ? "Not shared: the person did not consent to sharing with a counsellor." : "No text indicators."}</p>}
        <ul className="flex flex-col gap-2">
          {indicators.map((i) => (
            <li key={i.id} className={`rounded border border-border p-2 text-sm ${i.status === "REJECTED" || i.negated ? "opacity-60" : ""}`} data-testid="indicator">
              <div className="flex flex-wrap items-center gap-2">
                <strong>{DIM_LABEL[i.dimension] ?? i.dimension}</strong>
                <span className="font-mono">{(i.review?.score ?? i.score).toFixed(2)}</span>
                <span className="text-xs text-muted-foreground">
                  {i.source.toLowerCase().replace("_", " ")} · confidence {i.confidence.toFixed(2)}
                  {i.negated ? " · negated (not scored)" : ""} · {i.status.toLowerCase()}
                </span>
                {i.flags.length > 0 && <span className="rounded bg-red-100 px-1 text-xs text-red-900">{i.flags.join(", ")}</span>}
              </div>
              {i.evidence.quote && <q className="block italic">{i.evidence.quote}</q>}
              {i.label && <span className="block text-xs text-muted-foreground">{i.label}</span>}
              {i.review && (
                <span className="block text-xs">
                  Reviewed by {i.review.by.name}: {i.review.reason}
                </span>
              )}
              <div className="mt-1 flex gap-2">
                {(["CONFIRM", "REJECT", "ADJUST"] as const).map((act) => (
                  <button key={act} type="button" className="rounded border border-border px-2 text-xs" onClick={() => setReview({ id: i.id, action: act })}>
                    {act.toLowerCase()}
                  </button>
                ))}
              </div>
              {review?.id === i.id && (
                <form onSubmit={submitReview} className="mt-2 flex flex-wrap items-end gap-2">
                  {review.action === "ADJUST" && (
                    <label className="flex flex-col text-xs">
                      New score
                      <input name="score" type="number" min="0" max="1" step="0.05" required className="w-20 rounded border border-border px-1" />
                    </label>
                  )}
                  <label className="flex flex-1 flex-col text-xs">
                    Reason (required)
                    <input name="reason" minLength={5} required className="rounded border border-border px-1" />
                  </label>
                  <button type="submit" className="rounded bg-primary px-2 py-1 text-xs text-primary-foreground">
                    Save {review.action.toLowerCase()}
                  </button>
                  <button type="button" className="text-xs underline" onClick={() => setReview(null)}>
                    Cancel
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-2 rounded-md border border-border p-4">
        <h2 className="font-semibold">Transcript</h2>
        {noShare && <p className="text-sm text-muted-foreground">The person did not consent to sharing their words with a counsellor.</p>}
        <ol className="flex flex-col gap-3">
          {messages.map((m) => (
            <li key={m.id} className="text-sm" data-testid="message">
              <div className="text-xs text-muted-foreground">
                #{m.seq} · {m.sender.toLowerCase()} · {m.language ?? ""}
                {m.emotion ? ` · ${m.emotion.label}` : ""} · {new Date(m.createdAt).toLocaleString()}
              </div>
              <p>
                <Highlighted text={m.text} spans={spansByMessage.get(m.id) ?? []} />
              </p>
              {m.translation && m.translation !== m.text && <p className="text-muted-foreground">EN: {m.translation}</p>}
            </li>
          ))}
        </ol>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-2 rounded-md border border-border p-4 text-sm">
          <h2 className="font-semibold">Consent and context</h2>
          <p>
            Text analysis: {c.consent.textAnalysis ? "yes" : "no"} · Voice: {c.consent.voiceAnalysis ? "yes" : "no"} · Share with counsellor:{" "}
            {c.consent.shareWithCounsellor ? "yes" : "no"} · Follow-up contact: {c.consent.followUpContact ? "yes" : "no"}
          </p>
          {c.context && Object.keys(c.context).length > 0 && (
            <p>
              {Object.entries(c.context)
                .map(([k, v]) => `${k}: ${String(v)}`)
                .join(" · ")}
            </p>
          )}
          {!!c.screenerScores?.length && (
            <p>
              {c.screenerScores.map((s) => `${s.instrument} ${s.total}/${s.maxTotal}${s.isPositive ? " (positive)" : ""}`).join(" · ")}
            </p>
          )}
        </div>
        <div className="flex flex-col gap-2 rounded-md border border-border p-4 text-sm">
          <h2 className="font-semibold">Recommendations</h2>
          {c.recommendations.length === 0 && <p className="text-muted-foreground">None.</p>}
          <ul className="flex flex-col gap-1">
            {c.recommendations.map((r) => (
              <li key={r.id}>
                <strong>{r.type.replace(/_/g, " ").toLowerCase()}</strong> · {r.urgency.replace(/_/g, " ").toLowerCase()} · {r.status.toLowerCase()} ·{" "}
                {r.responsibleRole.replace(/_/g, " ").toLowerCase()}
                <span className="block text-xs text-muted-foreground">{r.reason}</span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">Approval and referrals arrive in Phase 6.</p>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <form onSubmit={override} className="flex flex-col gap-2 rounded-md border border-border p-4 text-sm" data-testid="override-form">
          <h2 className="font-semibold">Change band (human override)</h2>
          <p className="text-xs text-muted-foreground">Only a person can lower a locked band, with a written reason (FR-RISK-03).</p>
          <select name="toBand" defaultValue={c.band ?? "LOW"} className="rounded border border-border p-1">
            {["LOW", "MODERATE", "HIGH", "CRITICAL"].map((b) => (
              <option key={b} value={b}>
                {b.toLowerCase()}
              </option>
            ))}
          </select>
          <input name="reason" placeholder="Reason (at least 5 characters)" className="rounded border border-border p-1" />
          <button type="submit" className="rounded bg-primary px-3 py-1 text-primary-foreground">
            Change band
          </button>
          {c.bandOverrides.map((o, i) => (
            <p key={i} className="text-xs">
              {o.fromBand} → {o.toBand} by {o.by?.name ?? "?"}: {o.reason}
            </p>
          ))}
        </form>
        <div className="flex flex-col gap-2 rounded-md border border-border p-4 text-sm">
          <h2 className="font-semibold">Case actions and notes</h2>
          <div className="flex flex-wrap gap-2">
            {["UNDER_REVIEW", "ACTION_TAKEN", "CLOSED"].map((s) => (
              <button key={s} type="button" onClick={() => patch({ status: s })} className="rounded border border-border px-2">
                Mark {s.replace(/_/g, " ").toLowerCase()}
              </button>
            ))}
          </div>
          <form onSubmit={addNote} className="flex gap-2">
            <input name="body" required placeholder="Add a note" className="flex-1 rounded border border-border p-1" />
            <button type="submit" className="rounded bg-primary px-3 text-primary-foreground">
              Save
            </button>
          </form>
          <ul className="flex flex-col gap-1">
            {notes.map((n) => (
              <li key={n.id}>
                <span className="text-xs text-muted-foreground">
                  {n.author?.name} · {new Date(n.createdAt).toLocaleString()}
                </span>
                <p>{n.body}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
