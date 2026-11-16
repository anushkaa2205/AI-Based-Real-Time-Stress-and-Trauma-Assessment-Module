"use client";

/**
 * State / ministry / district analytics (task 8.3, FR-DSH-06/07/08, NFR-PRI-05, AC-DSH-02).
 * Anonymised roll-up only; any cell under 5 arrives as null and is shown as "<5".
 *
 * Charts follow the dataviz method: bands use one validated ordinal blue ramp (they are
 * ordered, not categories); text stays in ink colours; every chart has hover detail and a
 * table view; filters sit in one row above the charts.
 */
import { useCallback, useEffect, useMemo, useState } from "react";

type Band = "LOW" | "MODERATE" | "HIGH" | "CRITICAL";
type Cell<T> = { value: T | null; suppressed: boolean };
interface Summary {
  interactions: Cell<number>;
  byBand: Record<Band, Cell<number>>;
  criticalAlerts: Cell<number>;
  medianAckSec: Cell<number | null>;
  medianFirstResponseSec: Cell<number | null>;
  referralsCreated: Cell<number>;
  referralsDone: Cell<number>;
  slaBreaches: Cell<number>;
  from: string;
  to: string;
}
interface Heat {
  districtId: string;
  districtName: string;
  criticalPer1000: number | null;
  highPer1000: number | null;
  count: number | null;
  suppressed: boolean;
}
interface Trend {
  period: string;
  byBand: Record<Band, Cell<number>>;
  topDimensions: { dimension: string; share: number }[];
}
interface Cap {
  districtId: string;
  districtName: string;
  supportType: string;
  demand: number | null;
  completed: number | null;
  suppressed: boolean;
}

const BANDS: Band[] = ["LOW", "MODERATE", "HIGH", "CRITICAL"];
const BAND_LABEL: Record<Band, string> = { LOW: "Low", MODERATE: "Moderate", HIGH: "High", CRITICAL: "Critical" };
const DIM: Record<string, string> = {
  SUICIDAL_IDEATION: "Suicidal thoughts",
  INTIMIDATION: "Intimidation",
  SEVERE_TRAUMA: "Trauma",
  EXTREME_VULNERABILITY: "Vulnerability",
  FEAR_ANXIETY: "Fear / anxiety",
  DEPRESSION: "Low mood",
  SOCIAL_ISOLATION: "Isolation",
  ACUTE_STRESS: "Acute stress",
};
const lower = (s: string) => s.replace(/_/g, " ").toLowerCase();
const show = (c: Cell<number | null> | undefined) => (!c ? "–" : c.suppressed ? "<5" : c.value === null ? "–" : c.value.toLocaleString("en-IN"));
const duration = (c: Cell<number | null>) => {
  if (c.suppressed) return "<5 alerts";
  if (c.value === null) return "–";
  const s = c.value;
  return s < 90 ? `${s} s` : s < 5400 ? `${Math.round(s / 60)} min` : `${(s / 3600).toFixed(1)} h`;
};

/** Validated ordinal ramps (dataviz validator: all checks pass, light and dark). */
const VIZ_STYLE = `
.viz-root {
  --surface-1: #fcfcfb; --ink-1: #0b0b0b; --ink-2: #52514e; --ink-muted: #898781;
  --grid: #e1e0d9; --axis: #c3c2b7;
  --band-LOW: #86b6ef; --band-MODERATE: #3987e5; --band-HIGH: #1c5cab; --band-CRITICAL: #0d366b;
  --seq-0: #cde2fb; --seq-1: #9ec5f4; --seq-2: #5598e7; --seq-3: #256abf; --seq-4: #104281;
}
@media (prefers-color-scheme: dark) {
  :root:where(:not([data-theme="light"])) .viz-root {
    --surface-1: #1a1a19; --ink-1: #f0efec; --ink-2: #c3c2b7; --grid: #2c2c2a; --axis: #383835;
    --band-LOW: #184f95; --band-MODERATE: #2a78d6; --band-HIGH: #6da7ec; --band-CRITICAL: #b7d3f6;
    --seq-0: #184f95; --seq-1: #256abf; --seq-2: #3987e5; --seq-3: #6da7ec; --seq-4: #b7d3f6;
  }
}
:root[data-theme="dark"] .viz-root {
  --surface-1: #1a1a19; --ink-1: #f0efec; --ink-2: #c3c2b7; --grid: #2c2c2a; --axis: #383835;
  --band-LOW: #184f95; --band-MODERATE: #2a78d6; --band-HIGH: #6da7ec; --band-CRITICAL: #b7d3f6;
  --seq-0: #184f95; --seq-1: #256abf; --seq-2: #3987e5; --seq-3: #6da7ec; --seq-4: #b7d3f6;
}
`;

async function get<T>(path: string): Promise<T | null> {
  const r = await fetch(path, { cache: "no-store" }).catch(() => null);
  return r?.ok ? ((await r.json()) as T) : null;
}

function Tile({ label, value, hint, testId }: { label: string; value: string; hint?: string; testId?: string }) {
  return (
    <div className="card flex flex-col gap-1 p-3" data-testid={testId}>
      <span className="text-xs text-[var(--ink-2)]">{label}</span>
      <span className="text-2xl font-semibold tabular-nums text-[var(--ink-1)]">{value}</span>
      {hint && <span className="text-xs text-[var(--ink-muted)]">{hint}</span>}
    </div>
  );
}

function Legend() {
  return (
    <ul className="flex flex-wrap gap-3 text-xs text-[var(--ink-2)]" aria-label="Risk bands">
      {BANDS.map((b) => (
        <li key={b} className="flex items-center gap-1">
          <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: `var(--band-${b})` }} />
          {BAND_LABEL[b]}
        </li>
      ))}
    </ul>
  );
}

/** Horizontal bars, one per band, direct-labelled; suppressed bands drawn as a dashed outline. */
function BandBars({ byBand, total }: { byBand: Record<Band, Cell<number>>; total: Cell<number> }) {
  const max = Math.max(1, ...BANDS.map((b) => byBand[b].value ?? 0));
  const anySuppressed = total.suppressed || BANDS.some((b) => byBand[b].suppressed);
  const notAssessed = anySuppressed ? null : (total.value ?? 0) - BANDS.reduce((s, b) => s + (byBand[b].value ?? 0), 0);
  return (
    <div className="flex flex-col gap-2" data-testid="band-bars">
      {BANDS.map((b) => {
        const c = byBand[b];
        const w = c.suppressed ? 0 : ((c.value ?? 0) / max) * 100;
        return (
          <div key={b} className="group grid grid-cols-[5.5rem_1fr_3.5rem] items-center gap-2 text-sm" title={`${BAND_LABEL[b]}: ${show(c)} interactions`}>
            <span className="text-[var(--ink-2)]">{BAND_LABEL[b]}</span>
            <div className="relative h-4 border-l border-[var(--axis)]">
              {c.suppressed ? (
                <span className="absolute inset-y-0 left-0 w-6 rounded-r border border-dashed border-[var(--ink-muted)]" aria-hidden />
              ) : (
                <span className="absolute inset-y-0 left-0 rounded-r group-hover:opacity-80" style={{ width: `${w}%`, background: `var(--band-${b})` }} aria-hidden />
              )}
            </div>
            <span className="text-right tabular-nums text-[var(--ink-1)]">{show(c)}</span>
          </div>
        );
      })}
      {notAssessed !== null && notAssessed > 0 && (
        <p className="text-xs text-[var(--ink-muted)]">
          {notAssessed < 5 ? "<5" : notAssessed} not assessed yet (sessions that ended before any question was answered).
        </p>
      )}
    </div>
  );
}

/** Stacked bars per period (one axis, 2px surface gaps between segments), hover shows the breakdown. */
function TrendChart({ items }: { items: Trend[] }) {
  const [hover, setHover] = useState<number | null>(null);
  if (!items.length) return <p className="text-sm text-[var(--ink-muted)]">No data in this range yet.</p>;
  const totals = items.map((t) => BANDS.reduce((s, b) => s + (t.byBand[b].value ?? 0), 0));
  const max = Math.max(1, ...totals);
  const h = 160;
  return (
    <div className="flex flex-col gap-2">
      <div className="relative flex items-end gap-1 border-b border-[var(--axis)] pt-6" style={{ height: h + 24 }} data-testid="trend-chart">
        {items.map((t, i) => (
          <div
            key={t.period}
            className="relative flex h-full min-w-3 flex-1 cursor-default flex-col-reverse items-stretch justify-start gap-[2px]"
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
            onFocus={() => setHover(i)}
            onBlur={() => setHover(null)}
            tabIndex={0}
            aria-label={`${t.period}: ${BANDS.map((b) => `${BAND_LABEL[b]} ${show(t.byBand[b])}`).join(", ")}`}
          >
            {BANDS.map((b, bi) => {
              const v = t.byBand[b].value ?? 0;
              if (!v) return null;
              const top = BANDS.slice(bi + 1).every((x) => !(t.byBand[x].value ?? 0));
              return <span key={b} className={top ? "rounded-t" : ""} style={{ height: `${(v / max) * h}px`, background: `var(--band-${b})` }} />;
            })}
            {hover === i && (
              <div role="tooltip" className="absolute bottom-full left-1/2 z-10 mb-1 w-40 -translate-x-1/2 rounded-[3px] border border-border bg-[var(--surface-1)] p-2 text-xs shadow">
                <p className="font-semibold text-[var(--ink-1)]">{t.period}</p>
                {BANDS.map((b) => (
                  <p key={b} className="flex justify-between text-[var(--ink-2)]">
                    <span className="flex items-center gap-1">
                      <span aria-hidden className="inline-block h-2 w-2 rounded-sm" style={{ background: `var(--band-${b})` }} />
                      {BAND_LABEL[b]}
                    </span>
                    <span className="tabular-nums text-[var(--ink-1)]">{show(t.byBand[b])}</span>
                  </p>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="flex justify-between text-xs text-[var(--ink-muted)]">
        <span>{items[0]!.period}</span>
        <span>{items.at(-1)!.period}</span>
      </div>
      <Legend />
      <p className="text-xs text-[var(--ink-muted)]">Bands with fewer than 5 interactions in a period are left out of the bars and shown as “&lt;5”.</p>
    </div>
  );
}

function seqStep(v: number | null, max: number): string {
  if (v === null || max <= 0) return "transparent";
  return `var(--seq-${Math.min(4, Math.floor((v / max) * 4.999))})`;
}

export function AnalyticsDashboard({ fixedDistrict }: { fixedDistrict: boolean }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [channel, setChannel] = useState("");
  const [language, setLanguage] = useState("");
  const [demo, setDemo] = useState<"include" | "exclude" | "only">("include");
  const [district, setDistrict] = useState("");
  const [interval, setInterval] = useState<"day" | "week">("day");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [heat, setHeat] = useState<Heat[]>([]);
  const [trend, setTrend] = useState<Trend[]>([]);
  const [cap, setCap] = useState<Cap[]>([]);
  const [tableView, setTableView] = useState(false);
  const [loading, setLoading] = useState(true);

  const qs = useMemo(() => {
    const p = new URLSearchParams();
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    if (channel) p.set("channel", channel);
    if (language) p.set("language", language);
    if (demo !== "include") p.set("demo", demo); // M.7
    if (district && !fixedDistrict) {
      p.set("scope", "district");
      p.set("districtId", district);
    }
    return p.toString();
  }, [from, to, channel, language, demo, district, fixedDistrict]);

  const load = useCallback(async () => {
    setLoading(true);
    const base = "/api/v1/staff/analytics";
    const [s, h, t, c] = await Promise.all([
      get<Summary>(`${base}/summary?${qs}`),
      get<{ items: Heat[] }>(`${base}/heatmap?${qs}`),
      get<{ items: Trend[] }>(`${base}/trends?${qs}&interval=${interval}`),
      get<{ items: Cap[] }>(`${base}/capacity?${qs}`),
    ]);
    setSummary(s);
    setHeat(h?.items ?? []);
    setTrend(t?.items ?? []);
    setCap(c?.items ?? []);
    setLoading(false);
  }, [qs, interval]);

  useEffect(() => {
    const first = setTimeout(load, 0);
    return () => clearTimeout(first);
  }, [load]);

  const [districtOptions, setDistrictOptions] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    if (!district && heat.length) {
      const opts = heat.map((x) => ({ id: x.districtId, name: x.districtName })).sort((a, b) => a.name.localeCompare(b.name));
      const t = setTimeout(() => setDistrictOptions(opts), 0);
      return () => clearTimeout(t);
    }
  }, [heat, district]);

  const completion =
    summary && !summary.referralsCreated.suppressed && !summary.referralsDone.suppressed && (summary.referralsCreated.value ?? 0) > 0
      ? `${Math.round((100 * (summary.referralsDone.value ?? 0)) / summary.referralsCreated.value!)}%`
      : summary?.referralsCreated.suppressed
        ? "<5 referrals"
        : "–";
  const heatMax = Math.max(0, ...heat.map((x) => x.criticalPer1000 ?? 0));

  const input = "field w-auto min-w-28";
  return (
    <div className="viz-root flex flex-col gap-6">
      <style>{VIZ_STYLE}</style>

      <form className="flex flex-wrap items-end gap-3" onSubmit={(e) => e.preventDefault()} aria-label="Filters">
        <label className="flex flex-col text-xs">
          From
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={input} />
        </label>
        <label className="flex flex-col text-xs">
          To
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={input} />
        </label>
        {!fixedDistrict && (
          <label className="flex flex-col text-xs">
            District
            <select value={district} onChange={(e) => setDistrict(e.target.value)} className={input} data-testid="filter-district">
              <option value="">All in my scope</option>
              {districtOptions.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="flex flex-col text-xs">
          Channel
          <select value={channel} onChange={(e) => setChannel(e.target.value)} className={input}>
            <option value="">All</option>
            {["PORTAL", "CHATBOT", "VOICE_CALL", "IVRS", "MOBILE_APP", "OPERATOR_ASSISTED", "API"].map((c) => (
              <option key={c} value={c}>
                {lower(c)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col text-xs">
          Language
          <select value={language} onChange={(e) => setLanguage(e.target.value)} className={input}>
            <option value="">All</option>
            {[
              ["en", "English"],
              ["hi", "Hindi"],
              ["mr", "Marathi"],
              ["ta", "Tamil"],
              ["bn", "Bengali"],
            ].map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col text-xs">
          Demo cases
          <select value={demo} onChange={(e) => setDemo(e.target.value as "include" | "exclude" | "only")} className={input} data-testid="filter-demo">
            <option value="include">Included</option>
            <option value="exclude">Excluded</option>
            <option value="only">Only demo</option>
          </select>
        </label>
        <label className="flex flex-col text-xs">
          Trend by
          <select value={interval} onChange={(e) => setInterval(e.target.value as "day" | "week")} className={input}>
            <option value="day">Day</option>
            <option value="week">Week</option>
          </select>
        </label>
        <a href={`/api/v1/staff/analytics/export.csv?${qs}`} className="btn btn-secondary" data-testid="export-csv">
          Export CSV
        </a>
        <label className="flex items-center gap-1 text-xs">
          <input type="checkbox" checked={tableView} onChange={(e) => setTableView(e.target.checked)} /> Table view
        </label>
      </form>

      {loading && !summary && <p className="text-sm text-[var(--ink-muted)]">Loading…</p>}
      {summary && (
        <>
          <p className="text-xs text-[var(--ink-muted)]">
            {summary.from} to {summary.to}. Anonymised daily totals; any number under 5 is hidden as “&lt;5”.
          </p>
          <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6" aria-label="Headline numbers">
            <Tile label="Interactions" value={show(summary.interactions)} testId="tile-interactions" />
            <Tile label="Critical alerts" value={show(summary.criticalAlerts)} />
            <Tile label="Median time to acknowledge" value={duration(summary.medianAckSec)} hint="Critical alerts" />
            <Tile label="Median time to first response" value={duration(summary.medianFirstResponseSec)} hint="first staff action on the case" />
            <Tile label="Referral completion" value={completion} hint={`${show(summary.referralsDone)} of ${show(summary.referralsCreated)} done`} />
            <Tile label="Missed deadlines" value={show(summary.slaBreaches)} hint="referrals past their due time" />
          </section>

          <div className="grid gap-6 lg:grid-cols-2">
            <section className="card flex flex-col gap-3 p-4">
              <h2 className="section-title">Interactions by risk band</h2>
              {tableView ? (
                <table className="text-sm">
                  <tbody>
                    {BANDS.map((b) => (
                      <tr key={b}>
                        <td className="pr-4">{BAND_LABEL[b]}</td>
                        <td className="tabular-nums">{show(summary.byBand[b])}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <BandBars byBand={summary.byBand} total={summary.interactions} />
              )}
            </section>
            <section className="card flex flex-col gap-3 p-4">
              <h2 className="section-title">Trend</h2>
              {tableView ? (
                <table className="text-sm">
                  <thead>
                    <tr>
                      <th className="pr-3 text-left">Period</th>
                      {BANDS.map((b) => (
                        <th key={b} className="pr-3 text-right">
                          {BAND_LABEL[b]}
                        </th>
                      ))}
                      <th className="text-left">Most common signs</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trend.map((t) => (
                      <tr key={t.period}>
                        <td className="pr-3">{t.period}</td>
                        {BANDS.map((b) => (
                          <td key={b} className="pr-3 text-right tabular-nums">
                            {show(t.byBand[b])}
                          </td>
                        ))}
                        <td className="text-xs">{t.topDimensions.map((d) => `${DIM[d.dimension] ?? d.dimension} ${Math.round(d.share * 100)}%`).join(", ") || "–"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <TrendChart items={trend} />
              )}
            </section>
          </div>

          <section className="card flex flex-col gap-2 p-4">
            <h2 className="section-title">Districts: High and Critical per 1000 interactions</h2>
            <table className="text-sm" data-testid="heatmap">
              <thead>
                <tr className="text-left text-xs text-[var(--ink-2)]">
                  <th className="p-1">District</th>
                  <th className="p-1 text-right">Interactions</th>
                  <th className="p-1 text-right">Critical / 1000</th>
                  <th className="p-1 text-right">High / 1000</th>
                </tr>
              </thead>
              <tbody>
                {heat.map((x) => (
                  <tr key={x.districtId} className="border-t border-border" data-testid="heat-row" data-suppressed={x.suppressed}>
                    <td className="p-1">{x.districtName}</td>
                    <td className="p-1 text-right tabular-nums">{x.suppressed ? "<5" : (x.count ?? "–")}</td>
                    <td className="p-1 text-right">
                      <span className="flex items-center justify-end gap-2">
                        <span aria-hidden className="inline-block h-3 w-8 rounded-sm" style={{ background: seqStep(x.criticalPer1000, heatMax) }} />
                        <span className="w-10 tabular-nums">{x.suppressed ? "<5" : (x.criticalPer1000 ?? "–")}</span>
                      </span>
                    </td>
                    <td className="p-1 text-right tabular-nums">{x.suppressed ? "<5" : (x.highPer1000 ?? "–")}</td>
                  </tr>
                ))}
                {!heat.length && (
                  <tr>
                    <td colSpan={4} className="p-1 text-[var(--ink-muted)]">
                      No data in this range yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </section>

          <section className="card flex flex-col gap-2 p-4">
            <h2 className="section-title">Demand and capacity: referrals by district and support type</h2>
            <table className="text-sm" data-testid="capacity">
              <thead>
                <tr className="text-left text-xs text-[var(--ink-2)]">
                  <th className="p-1">District</th>
                  <th className="p-1">Support</th>
                  <th className="p-1 text-right">Requested</th>
                  <th className="p-1 text-right">Done</th>
                  <th className="p-1">Completion</th>
                </tr>
              </thead>
              <tbody>
                {cap.map((x) => {
                  const pct = !x.suppressed && x.demand ? Math.min(100, Math.round((100 * (x.completed ?? 0)) / x.demand)) : null;
                  return (
                    <tr key={`${x.districtId}-${x.supportType}`} className="border-t border-border">
                      <td className="p-1">{x.districtName}</td>
                      <td className="p-1">{lower(x.supportType)}</td>
                      <td className="p-1 text-right tabular-nums">{x.demand ?? "<5"}</td>
                      <td className="p-1 text-right tabular-nums">{x.completed ?? "<5"}</td>
                      <td className="p-1">
                        {pct === null ? (
                          <span className="text-xs text-[var(--ink-muted)]">hidden (&lt;5)</span>
                        ) : (
                          <span className="flex items-center gap-2" title={`${pct}% done`}>
                            <span className="relative inline-block h-2 w-24 rounded bg-[var(--grid)]">
                              <span className="absolute inset-y-0 left-0 rounded" style={{ width: `${pct}%`, background: "var(--band-MODERATE)" }} />
                            </span>
                            <span className="tabular-nums">{pct}%</span>
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {!cap.length && (
                  <tr>
                    <td colSpan={5} className="p-1 text-[var(--ink-muted)]">
                      No referrals in this range.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </section>
        </>
      )}
    </div>
  );
}
