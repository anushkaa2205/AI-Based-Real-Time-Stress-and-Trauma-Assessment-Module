"use client";

/**
 * Demo results view (PRODUCT_VISION.md §7): one consistent presenter's view for every demo mode,
 * built only from what the module returned. Scenario expectations are kept apart, clearly labelled.
 * Presenters and reviewers only: a victim-facing screen must never show any of this (rule 1).
 */
import Link from "next/link";
import { BandBadge } from "@/components/staff/band-badge";
import { BAND_THRESHOLDS, DIMENSION_LABEL, LANGUAGE_LABEL, OVERRIDE_LABEL, SOURCE_LABEL, SUPPORT_LABEL, URGENCY_LABEL, clock, lower, seconds } from "./labels";
import type { ModuleResults } from "./use-module-results";

export interface TimelineEvent {
  id: string;
  at: number;
  label: string;
  detail?: string;
  state: "ok" | "pending" | "warn" | "error";
  requestId?: string | null;
  ms?: number;
}

export interface InputSummary {
  mode: string;
  channel: string;
  language: string;
  scenarioId: string | null;
  docketNumber: string | null;
  interactionId: string | null;
  caseId: string | null;
}

export interface Expected {
  band: string;
  indicators: string[];
  recommendations: string[];
  overrides?: string[];
}

const BAND_COLOR: Record<string, string> = { LOW: "#8db592", MODERATE: "#c9a227", HIGH: "#d9773f", CRITICAL: "#a4161a" };

function Section({ title, children, testId, aside }: { title: string; children: React.ReactNode; testId?: string; aside?: React.ReactNode }) {
  return (
    <section className="border-t border-line px-4 py-3.5 first:border-t-0" data-testid={testId}>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h3 className="section-title">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

/** 0–100 scale with the band zones of the scoring config and a marker at the SVI. */
function SviScale({ svi, band }: { svi: number; band: string }) {
  const t = BAND_THRESHOLDS;
  const zones = [
    { band: "LOW", from: 0, to: t.moderate },
    { band: "MODERATE", from: t.moderate, to: t.high },
    { band: "HIGH", from: t.high, to: t.critical },
    { band: "CRITICAL", from: t.critical, to: 100 },
  ];
  return (
    <div className="mt-3" aria-hidden>
      <div className="relative h-3 overflow-hidden rounded-[2px] border border-line">
        <div className="flex h-full">
          {zones.map((z) => (
            <span key={z.band} style={{ width: `${z.to - z.from}%`, background: BAND_COLOR[z.band], opacity: z.band === band ? 0.9 : 0.25 }} />
          ))}
        </div>
      </div>
      <div className="relative h-4">
        <span className="absolute -top-[1.05rem] h-5 w-[3px] -translate-x-1/2 bg-ink" style={{ left: `${Math.min(100, Math.max(0, svi))}%` }} />
        {[t.moderate, t.high, t.critical].map((v) => (
          <span key={v} className="absolute top-0.5 -translate-x-1/2 font-mono text-[0.65rem] text-muted-foreground" style={{ left: `${v}%` }}>
            {v}
          </span>
        ))}
      </div>
    </div>
  );
}

function Sparkline({ history }: { history: ModuleResults["history"] }) {
  if (history.length < 2) return null;
  const w = 120;
  const h = 28;
  const pts = history.map((p, i) => `${(i / (history.length - 1)) * w},${h - (p.svi / 100) * h}`).join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="overflow-visible" role="img" aria-label={`SVI over ${history.length} assessments`}>
      <line x1={0} x2={w} y1={h - (BAND_THRESHOLDS.high / 100) * h} y2={h - (BAND_THRESHOLDS.high / 100) * h} stroke="#d8d3c8" strokeDasharray="2 2" />
      <polyline points={pts} fill="none" stroke="#1f3a5f" strokeWidth={1.75} />
    </svg>
  );
}

const STATE_DOT: Record<TimelineEvent["state"], string> = { ok: "bg-ok", pending: "bg-[#9aa3b0]", warn: "bg-warn", error: "bg-danger" };

export function ResultsPanel({
  summary,
  results,
  timeline,
  expected,
  onRefresh,
  live,
}: {
  summary: InputSummary;
  results: ModuleResults;
  timeline: TimelineEvent[];
  expected?: Expected | null;
  onRefresh?: () => void;
  live: boolean;
}) {
  const a = results.assessment;
  const dims = a ? Object.entries(a.dimensions).filter(([, d]) => d.score > 0).sort((x, y) => y[1].contribution - x[1].contribution) : [];
  const active = results.indicators.filter((i) => !i.negated);
  const negated = results.indicators.filter((i) => i.negated);
  const recs = results.recommendations.filter((r) => r.status !== "SUPERSEDED");
  const versions = [...new Set(results.indicators.map((i) => i.modelVersion))];

  return (
    <aside aria-label="Module results" className="card flex flex-col overflow-hidden shadow-[0_1px_0_#d8d3c8]" data-testid="results-panel">
      <header className="flex items-center justify-between gap-2 bg-navy-deep px-4 py-2.5 text-white">
        <div>
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.1em] text-white/70">Module output</p>
          <h2 className="text-base font-bold leading-tight">Assessment results</h2>
        </div>
        <div className="flex items-center gap-2 text-xs text-white/75">
          {live && (
            <span className="flex items-center gap-1.5">
              <span className="size-2 animate-pulse rounded-full bg-[#7fc48b]" aria-hidden /> Live
            </span>
          )}
          {onRefresh && (
            <button type="button" onClick={onRefresh} className="rounded-[3px] border border-white/30 px-2 py-0.5 text-white hover:bg-white/10">
              Refresh
            </button>
          )}
        </div>
      </header>

      <Section title="1 · Input">
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
          <dt className="text-muted-foreground">Mode</dt>
          <dd>{summary.mode}</dd>
          <dt className="text-muted-foreground">Source channel</dt>
          <dd>
            {lower(summary.channel)} <span className="text-muted-foreground">(simulated)</span>
          </dd>
          <dt className="text-muted-foreground">Language</dt>
          <dd>{LANGUAGE_LABEL[summary.language] ?? summary.language}</dd>
          <dt className="text-muted-foreground">Scenario</dt>
          <dd className="font-mono">{summary.scenarioId ?? "none (free input)"}</dd>
          {summary.docketNumber && (
            <>
              <dt className="text-muted-foreground">Docket</dt>
              <dd className="font-mono">
                {summary.caseId ? (
                  <Link href={`/counsellor/case/${summary.caseId}`} className="underline underline-offset-4" data-testid="case-link">
                    {summary.docketNumber}
                  </Link>
                ) : (
                  summary.docketNumber
                )}
              </dd>
            </>
          )}
        </dl>
      </Section>

      <Section title="2 · Assessment" testId="assessment" aside={<Sparkline history={results.history} />}>
        {!a ? (
          <p className="text-sm text-muted-foreground">{summary.interactionId ? "No assessment yet. Send something to the module." : "Start a conversation to see the module's assessment."}</p>
        ) : (
          <div>
            <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
              <p className="leading-none">
                <span className="font-mono text-[2.6rem] font-bold tracking-tight text-ink" data-testid="svi">
                  {a.svi}
                </span>
                <span className="ml-1 text-sm text-muted-foreground">/ 100 SVI</span>
              </p>
              <div className="flex flex-col items-start gap-1 pb-1">
                <BandBadge band={a.band} />
                {a.computedBand !== a.band && <span className="text-xs text-muted-foreground">score alone: {lower(a.computedBand)}, raised by a safety rule</span>}
              </div>
            </div>
            <SviScale svi={a.svi} band={a.band} />
            {a.limitedConfidence && (
              <p className="mt-1 border-l-[3px] border-warn bg-[#fbf1df] px-2.5 py-1.5 text-xs text-[#5c3a00]" data-testid="limited-confidence">
                <strong>Limited confidence.</strong> Part of the analysis was unavailable or uncertain (for example the AI step is still running, or two voices could not be told apart).
              </p>
            )}
            <p className="mt-2.5 text-sm leading-relaxed text-ink">{a.explanation}</p>
            {a.overridesFired.length > 0 && (
              <ul className="mt-2.5 flex flex-col gap-1" data-testid="overrides">
                {a.overridesFired.map((o) => (
                  <li key={o} className="flex items-baseline gap-2 text-sm">
                    <span className="shrink-0 rounded-[2px] bg-danger px-1.5 font-mono text-[0.7rem] font-semibold text-white">{o}</span>
                    <span>{OVERRIDE_LABEL[o] ?? "safety override"}</span>
                  </li>
                ))}
              </ul>
            )}
            {dims.length > 0 && (
              <div className="mt-3 flex flex-col gap-1.5">
                {dims.map(([k, d]) => (
                  <div key={k} className="grid grid-cols-[minmax(0,10rem)_1fr_2.5rem] items-center gap-2 text-xs">
                    <span className="truncate text-ink-2">{DIMENSION_LABEL[k] ?? k}</span>
                    <span className="h-2 rounded-[1px] bg-muted">
                      <span className="block h-full rounded-[1px] bg-navy" style={{ width: `${Math.round(d.score * 100)}%` }} />
                    </span>
                    <span className="text-right font-mono">{d.score.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Section>

      <Section title="3 · Indicators and evidence" testId="indicators" aside={active.length > 0 ? <span className="text-xs text-muted-foreground">{active.length}</span> : undefined}>
        {active.length === 0 ? (
          <p className="text-sm text-muted-foreground">None found.</p>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {active.map((i) => (
              <li key={i.id} className="text-sm" data-testid="indicator">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <strong className="font-semibold">{DIMENSION_LABEL[i.dimension] ?? i.dimension}</strong>
                  <span className="font-mono text-xs">{i.score.toFixed(2)}</span>
                  <span className="text-xs text-muted-foreground">
                    {SOURCE_LABEL[i.source] ?? i.source}
                    {i.flags.length > 0 && ` · ${i.flags.map(lower).join(", ")}`}
                  </span>
                </div>
                {i.evidence.type === "TEXT_SPAN" && i.evidence.quote ? (
                  <blockquote className="mt-1 border-l-[3px] border-[#c9a227] bg-[#fbf6e4] px-2.5 py-1 text-[0.85rem] leading-snug">&ldquo;{i.evidence.quote}&rdquo;</blockquote>
                ) : i.evidence.type === "ACOUSTIC_EVENT" ? (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Voice cue{i.label ? `: ${i.label}` : i.evidence.cue ? `: ${lower(i.evidence.cue)}` : ""}
                    {i.evidence.startMs !== undefined && i.evidence.endMs !== undefined && (
                      <span className="ml-1 font-mono text-ink-2">
                        at {clock(i.evidence.startMs)}–{clock(i.evidence.endMs)}
                      </span>
                    )}
                  </p>
                ) : i.evidence.type === "CONTEXT_FIELD" ? (
                  <p className="mt-0.5 text-xs text-muted-foreground">From the case details NHAA sent{i.evidence.field ? ` (${i.evidence.field})` : ""}</p>
                ) : i.label ? (
                  <p className="mt-0.5 text-xs text-muted-foreground">{i.label}</p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {negated.length > 0 && <p className="mt-2 text-xs text-muted-foreground">{negated.length} negated mention(s) kept for audit, not scored (for example &ldquo;I am not thinking of hurting myself&rdquo;).</p>}
        {results.voice.length > 0 && (
          <div className="mt-3">
            <p className="mb-1 text-xs font-semibold text-ink-2">Voice windows (caller&apos;s speech)</p>
            <ol className="flex flex-col gap-0.5 font-mono text-[0.72rem]">
              {results.voice.map((w) => (
                <li key={w.windowIndex} className="grid grid-cols-[4.5rem_1fr] gap-2">
                  <span className="text-muted-foreground">
                    {clock(w.startMs)}–{clock(w.endMs)}
                  </span>
                  <span>
                    {(w.fusedEmotion ?? w.emotion)?.label ?? "no emotion"} · {w.pauses.count} pause{w.pauses.count === 1 ? "" : "s"}
                    {w.speechRateWpm ? ` · ${Math.round(w.speechRateWpm)} wpm` : ""}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        )}
      </Section>

      <Section title="4 · Proposed support" testId="recommendations">
        {recs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No proposals yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {recs.map((r) => (
              <li key={r.id} className="text-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <strong className="font-semibold">{SUPPORT_LABEL[r.type] ?? lower(r.type)}</strong>
                  <span className="text-xs text-muted-foreground">{URGENCY_LABEL[r.urgency] ?? lower(r.urgency)}</span>
                </div>
                <p className="text-xs text-ink-2">{r.reason}</p>
                <p
                  className={`mt-0.5 text-xs font-semibold ${r.status === "PROPOSED" ? "text-warn" : r.status === "AUTO_TRIGGERED" && r.type === "EMERGENCY_SUPPORT" ? "text-danger" : "text-ok"}`}
                >
                  {r.status === "PROPOSED"
                    ? "Proposal: waits for a counsellor or supervisor to approve"
                    : r.status === "AUTO_TRIGGERED"
                      ? r.type === "EMERGENCY_SUPPORT"
                        ? "Started automatically (Critical); a human reviews it afterwards"
                        : "Shared automatically; needs no approval"
                      : lower(r.status)}
                </p>
              </li>
            ))}
          </ul>
        )}
        {recs.some((r) => r.status === "PROPOSED" || (r.status === "AUTO_TRIGGERED" && r.type === "EMERGENCY_SUPPORT")) && (
          <Link href="/approvals" className="mt-2 inline-block text-xs underline underline-offset-4">
            Open the approvals inbox
          </Link>
        )}
      </Section>

      <Section title="5 · Processing" testId="timeline">
        {timeline.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing sent yet.</p>
        ) : (
          <ol className="flex max-h-64 flex-col gap-1 overflow-y-auto pr-1">
            {timeline.map((e) => (
              <li key={e.id} className="grid grid-cols-[0.6rem_1fr_auto] items-baseline gap-2 text-xs">
                <span className={`size-2 translate-y-[1px] rounded-full ${STATE_DOT[e.state]}`} aria-hidden />
                <span>
                  {e.label}
                  {e.detail && <span className="text-muted-foreground"> · {e.detail}</span>}
                </span>
                <span className="font-mono text-muted-foreground">{e.ms !== undefined ? seconds(e.ms) : ""}</span>
              </li>
            ))}
          </ol>
        )}
      </Section>

      <Section title="6 · Technical details">
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
          <dt className="text-muted-foreground">Interaction</dt>
          <dd className="truncate font-mono">{summary.interactionId ?? "–"}</dd>
          <dt className="text-muted-foreground">Last request</dt>
          <dd className="truncate font-mono">{[...timeline].reverse().find((e) => e.requestId)?.requestId ?? "–"}</dd>
          <dt className="text-muted-foreground">Scoring config</dt>
          <dd className="font-mono">{a ? `v${a.configVersion}` : "–"}</dd>
          <dt className="text-muted-foreground">Assessment</dt>
          <dd className="font-mono">{a ? `#${a.seq} · ${lower(a.trigger)} · confidence ${a.confidence.toFixed(2)}` : "–"}</dd>
          <dt className="text-muted-foreground">Models</dt>
          <dd className="break-words font-mono">{versions.length ? versions.join(", ") : "–"}</dd>
          {results.error && (
            <>
              <dt className="text-danger">Error</dt>
              <dd className="text-danger">{results.error}</dd>
            </>
          )}
        </dl>
      </Section>

      {expected && (
        <section className="m-3 mt-1 border border-dashed border-[#9aa3b0] bg-[#f3f1ec] px-3.5 py-3" data-testid="expected" aria-label="Expected result of the scenario">
          <p className="text-[0.7rem] font-bold uppercase tracking-[0.1em] text-ink-2">Expected · scenario label</p>
          <p className="mb-2 text-xs text-muted-foreground">Fixed before any run, for comparison only. Never sent to the module.</p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
            <dt className="text-muted-foreground">Band</dt>
            <dd className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">{lower(expected.band)}</span>
              {a && <span className={`text-xs ${a.band === expected.band ? "text-ok" : "text-warn"}`}>{a.band === expected.band ? "module agrees" : `module: ${lower(a.band)}`}</span>}
            </dd>
            <dt className="text-muted-foreground">Signs</dt>
            <dd>{expected.indicators.length ? expected.indicators.map((d) => DIMENSION_LABEL[d] ?? d).join(", ") : "none"}</dd>
            <dt className="text-muted-foreground">Support</dt>
            <dd>{expected.recommendations.map((s) => SUPPORT_LABEL[s] ?? s).join(", ") || "none"}</dd>
            {expected.overrides?.length ? (
              <>
                <dt className="text-muted-foreground">Overrides</dt>
                <dd className="font-mono">{expected.overrides.join(", ")}</dd>
              </>
            ) : null}
          </dl>
        </section>
      )}
    </aside>
  );
}
