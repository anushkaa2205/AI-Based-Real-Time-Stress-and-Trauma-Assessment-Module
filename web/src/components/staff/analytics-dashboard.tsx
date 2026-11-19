"use client";

/**
 * State / ministry / district analytics (task 8.3, FR-DSH-06/07/08, NFR-PRI-05, AC-DSH-02).
 * Anonymised roll-up only; any cell under 5 arrives as null and is shown as "<5".
 *
 * Charts follow the dataviz method: bands use one validated ordinal blue ramp (they are
 * ordered, not categories); text stays in ink colours; every chart has hover detail and a
 * table view; filters sit in one row above the charts.
 */
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useEnumLabel } from "./use-labels";
import { CHANNELS } from "@/models/enums";
import { SITE_LOCALES } from "@/i18n/locale";

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
const show = (c: Cell<number | null> | undefined) => (!c ? "–" : c.suppressed ? "<5" : c.value === null ? "–" : c.value.toLocaleString("en-IN"));

/** Band names in the site language. */
function useBandLabel(): (b: Band) => string {
  const e = useEnumLabel();
  return (b) => e("bands", b);
}

/** One theme (plan §9.6): charts use the brand colour and the band colours only. */
const VIZ_STYLE = `
.viz-root {
  --surface-1: #ffffff; --ink-1: #14181f; --ink-2: #4a5361; --ink-muted: #646c79;
  --grid: #e3e0d8; --axis: #c9c4b8;
  --band-LOW: #b8c0ca; --band-MODERATE: #b7860b; --band-HIGH: #c4511a; --band-CRITICAL: #b42318;
  --seq-0: #d6e7e9; --seq-1: #a9cdd1; --seq-2: #6ea9b1; --seq-3: #2f7c8b; --seq-4: #0b5563;
}
`;

async function get<T>(path: string): Promise<T | null> {
  const r = await fetch(path, { cache: "no-store" }).catch(() => null);
  return r?.ok ? ((await r.json()) as T) : null;
}

function Tile({ label, value, hint, testId }: { label: string; value: string; hint?: string; testId?: string }) {
  return (
    <div className="card flex flex-col gap-1 px-4 py-3" data-testid={testId}>
      <span className="section-title">{label}</span>
      <span className="num text-2xl font-medium text-[var(--ink-1)]">{value}</span>
      {hint && <span className="text-xs text-[var(--ink-muted)]">{hint}</span>}
    </div>
  );
}

function Legend() {
  const t = useTranslations("staff.analytics");
  const bandLabel = useBandLabel();
  return (
    <ul className="flex flex-wrap gap-3 text-xs text-[var(--ink-2)]" aria-label={t("bands")}>
      {BANDS.map((b) => (
        <li key={b} className="flex items-center gap-1">
          <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: `var(--band-${b})` }} />
          {bandLabel(b)}
        </li>
      ))}
    </ul>
  );
}

/** Horizontal bars, one per band, direct-labelled; suppressed bands drawn as a dashed outline. */
function BandBars({ byBand, total }: { byBand: Record<Band, Cell<number>>; total: Cell<number> }) {
  const t = useTranslations("staff.analytics");
  const bandLabel = useBandLabel();
  const max = Math.max(1, ...BANDS.map((b) => byBand[b].value ?? 0));
  const anySuppressed = total.suppressed || BANDS.some((b) => byBand[b].suppressed);
  const notAssessed = anySuppressed ? null : (total.value ?? 0) - BANDS.reduce((s, b) => s + (byBand[b].value ?? 0), 0);
  return (
    <div className="flex flex-col gap-2" data-testid="band-bars">
      {BANDS.map((b) => {
        const c = byBand[b];
        const w = c.suppressed ? 0 : ((c.value ?? 0) / max) * 100;
        return (
          <div key={b} className="group grid grid-cols-[5.5rem_1fr_3.5rem] items-center gap-2 text-sm" title={t("barTitle", { band: bandLabel(b), n: show(c) })}>
            <span className="text-[var(--ink-2)]">{bandLabel(b)}</span>
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
          {t("notAssessed", { n: notAssessed < 5 ? "<5" : String(notAssessed) })}
        </p>
      )}
    </div>
  );
}

/** Stacked bars per period (one axis, 2px surface gaps between segments), hover shows the breakdown. */
function TrendChart({ items }: { items: Trend[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const tr = useTranslations("staff.analytics");
  const bandLabel = useBandLabel();
  if (!items.length) return <p className="text-sm text-[var(--ink-muted)]">{tr("noData")}</p>;
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
            aria-label={`${t.period}: ${BANDS.map((b) => `${bandLabel(b)} ${show(t.byBand[b])}`).join(", ")}`}
          >
            {BANDS.map((b, bi) => {
              const v = t.byBand[b].value ?? 0;
              if (!v) return null;
              const top = BANDS.slice(bi + 1).every((x) => !(t.byBand[x].value ?? 0));
              return <span key={b} className={top ? "rounded-t" : ""} style={{ height: `${(v / max) * h}px`, background: `var(--band-${b})` }} />;
            })}
            {hover === i && (
              <div role="tooltip" className="absolute bottom-full left-1/2 z-10 mb-1 w-40 -translate-x-1/2 rounded-lg border border-border bg-[var(--surface-1)] p-2 text-xs shadow">
                <p className="font-semibold text-[var(--ink-1)]">{t.period}</p>
                {BANDS.map((b) => (
                  <p key={b} className="flex justify-between text-[var(--ink-2)]">
                    <span className="flex items-center gap-1">
                      <span aria-hidden className="inline-block h-2 w-2 rounded-sm" style={{ background: `var(--band-${b})` }} />
                      {bandLabel(b)}
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
      <p className="text-xs text-[var(--ink-muted)]">{tr("lt5Note")}</p>
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
  const t = useTranslations("staff.analytics");
  const langNames = useTranslations("languageNames");
  const e = useEnumLabel();
  const bandLabel = useBandLabel();
  const duration = (c: Cell<number | null>) => {
    if (c.suppressed) return t("lt5Alerts");
    if (c.value === null) return "–";
    const s = c.value;
    return s < 90 ? t("sec", { n: s }) : s < 5400 ? t("min", { n: Math.round(s / 60) }) : t("hours", { n: (s / 3600).toFixed(1) });
  };

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
        ? t("lt5Referrals")
        : "–";
  const heatMax = Math.max(0, ...heat.map((x) => x.criticalPer1000 ?? 0));

  const input = "field w-auto min-w-28";
  return (
    <div className="viz-root flex flex-col gap-6">
      <style>{VIZ_STYLE}</style>

      <form className="flex flex-wrap items-end gap-3" onSubmit={(ev) => ev.preventDefault()} aria-label={t("filters")}>
        <label className="flex flex-col text-xs">
          {t("from")}
          <input type="date" value={from} onChange={(ev) => setFrom(ev.target.value)} className={input} />
        </label>
        <label className="flex flex-col text-xs">
          {t("to")}
          <input type="date" value={to} onChange={(ev) => setTo(ev.target.value)} className={input} />
        </label>
        {!fixedDistrict && (
          <label className="flex flex-col text-xs">
            {t("district")}
            <select value={district} onChange={(ev) => setDistrict(ev.target.value)} className={input} data-testid="filter-district">
              <option value="">{t("allScope")}</option>
              {districtOptions.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="flex flex-col text-xs">
          {t("channel")}
          <select value={channel} onChange={(ev) => setChannel(ev.target.value)} className={input}>
            <option value="">{t("all")}</option>
            {CHANNELS.map((c) => (
              <option key={c} value={c}>
                {e("channels", c)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col text-xs">
          {t("language")}
          <select value={language} onChange={(ev) => setLanguage(ev.target.value)} className={input}>
            <option value="">{t("all")}</option>
            {SITE_LOCALES.map((v) => (
              <option key={v} value={v}>
                {langNames(v)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col text-xs">
          {t("demoCases")}
          <select value={demo} onChange={(ev) => setDemo(ev.target.value as "include" | "exclude" | "only")} className={input} data-testid="filter-demo">
            <option value="include">{t("included")}</option>
            <option value="exclude">{t("excluded")}</option>
            <option value="only">{t("onlyDemo")}</option>
          </select>
        </label>
        <label className="flex flex-col text-xs">
          {t("trendBy")}
          <select value={interval} onChange={(ev) => setInterval(ev.target.value as "day" | "week")} className={input}>
            <option value="day">{t("day")}</option>
            <option value="week">{t("week")}</option>
          </select>
        </label>
        <a href={`/api/v1/staff/analytics/export.csv?${qs}`} className="btn btn-secondary" data-testid="export-csv">
          {t("export")}
        </a>
        <label className="flex items-center gap-1 text-xs">
          <input type="checkbox" checked={tableView} onChange={(ev) => setTableView(ev.target.checked)} /> {t("tableView")}
        </label>
      </form>

      {loading && !summary && <p className="text-sm text-[var(--ink-muted)]">{t("loading")}</p>}
      {summary && (
        <>
          <p className="text-xs text-[var(--ink-muted)]">
            {t("range", { from: summary.from, to: summary.to })}
          </p>
          <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6" aria-label={t("headline")}>
            <Tile label={t("interactions")} value={show(summary.interactions)} testId="tile-interactions" />
            <Tile label={t("criticalAlerts")} value={show(summary.criticalAlerts)} />
            <Tile label={t("medianAck")} value={duration(summary.medianAckSec)} hint={t("criticalAlerts")} />
            <Tile label={t("medianFirst")} value={duration(summary.medianFirstResponseSec)} hint={t("firstAction")} />
            <Tile label={t("completion")} value={completion} hint={t("doneOf", { done: show(summary.referralsDone), total: show(summary.referralsCreated) })} />
            <Tile label={t("missed")} value={show(summary.slaBreaches)} hint={t("pastDue")} />
          </section>

          <div className="grid gap-6 lg:grid-cols-2">
            <section className="card card-pad flex flex-col gap-3">
              <h2 className="section-title">{t("byBand")}</h2>
              {tableView ? (
                <table className="text-sm">
                  <tbody>
                    {BANDS.map((b) => (
                      <tr key={b}>
                        <td className="pr-4">{bandLabel(b)}</td>
                        <td className="tabular-nums">{show(summary.byBand[b])}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <BandBars byBand={summary.byBand} total={summary.interactions} />
              )}
            </section>
            <section className="card card-pad flex flex-col gap-3">
              <h2 className="section-title">{t("trend")}</h2>
              {tableView ? (
                <table className="text-sm">
                  <thead>
                    <tr>
                      <th className="pr-3 text-left">{t("period")}</th>
                      {BANDS.map((b) => (
                        <th key={b} className="pr-3 text-right">
                          {bandLabel(b)}
                        </th>
                      ))}
                      <th className="text-left">{t("commonSigns")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trend.map((p) => (
                      <tr key={p.period}>
                        <td className="pr-3">{p.period}</td>
                        {BANDS.map((b) => (
                          <td key={b} className="pr-3 text-right tabular-nums">
                            {show(p.byBand[b])}
                          </td>
                        ))}
                        <td className="text-xs">{p.topDimensions.map((d) => `${e("dimensions", d.dimension)} ${Math.round(d.share * 100)}%`).join(", ") || "–"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <TrendChart items={trend} />
              )}
            </section>
          </div>

          <section className="card card-pad flex flex-col gap-3">
            <h2 className="section-title">{t("heatTitle")}</h2>
            <table className="text-sm" data-testid="heatmap">
              <thead>
                <tr className="text-left text-xs text-[var(--ink-2)]">
                  <th className="p-1">{t("district")}</th>
                  <th className="p-1 text-right">{t("interactions")}</th>
                  <th className="p-1 text-right">{t("critPer")}</th>
                  <th className="p-1 text-right">{t("highPer")}</th>
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
                      {t("noData")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </section>

          <section className="card card-pad flex flex-col gap-3">
            <h2 className="section-title">{t("capTitle")}</h2>
            <table className="text-sm" data-testid="capacity">
              <thead>
                <tr className="text-left text-xs text-[var(--ink-2)]">
                  <th className="p-1">{t("district")}</th>
                  <th className="p-1">{t("support")}</th>
                  <th className="p-1 text-right">{t("requested")}</th>
                  <th className="p-1 text-right">{t("done")}</th>
                  <th className="p-1">{t("completionCol")}</th>
                </tr>
              </thead>
              <tbody>
                {cap.map((x) => {
                  const pct = !x.suppressed && x.demand ? Math.min(100, Math.round((100 * (x.completed ?? 0)) / x.demand)) : null;
                  return (
                    <tr key={`${x.districtId}-${x.supportType}`} className="border-t border-border">
                      <td className="p-1">{x.districtName}</td>
                      <td className="p-1">{e("support", x.supportType)}</td>
                      <td className="p-1 text-right tabular-nums">{x.demand ?? "<5"}</td>
                      <td className="p-1 text-right tabular-nums">{x.completed ?? "<5"}</td>
                      <td className="p-1">
                        {pct === null ? (
                          <span className="text-xs text-[var(--ink-muted)]">{t("hidden")}</span>
                        ) : (
                          <span className="flex items-center gap-2" title={t("pctDone", { n: pct })}>
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
                      {t("noReferrals")}
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
