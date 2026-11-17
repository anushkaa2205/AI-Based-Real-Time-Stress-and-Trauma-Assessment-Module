"use client";

/**
 * The progress line for one case (plan §6.4): status, dates and the support arranged, in plain
 * words. Read through /api/demo/track, which only ever returns those fields (rule 1).
 */
import Link from "next/link";
import { Check, CircleDashed } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import type { CaseStatusResponse } from "@/contracts/integration";
import { CASE_STATUSES } from "@/models/enums";
import { TrackForm } from "./track-form";

export type TrackMessages = {
  title: string;
  lead: string;
  registeredOn: string;
  updatedOn: string;
  supportTitle: string;
  noSupport: string;
  notFound: string;
  unavailable: string;
  another: string;
  status: Record<string, string>;
  support: Record<string, string>;
};

type State = { kind: "loading" } | { kind: "ok"; data: CaseStatusResponse } | { kind: "notFound" } | { kind: "error" };

function fmt(iso: string, locale: string): string {
  return new Date(iso).toLocaleString(`${locale}-IN`, { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
}

export function TrackResult({ docket, t }: { docket: string; t: TrackMessages }) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const f = useTranslations("public.trackForm");

  useEffect(() => {
    let live = true;
    fetch(`/api/demo/track?docket=${encodeURIComponent(docket)}`, { credentials: "same-origin" })
      .then(async (res) => {
        if (!live) return;
        if (res.status === 404) return setState({ kind: "notFound" });
        if (!res.ok) return setState({ kind: "error" });
        setState({ kind: "ok", data: (await res.json()) as CaseStatusResponse });
      })
      .catch(() => live && setState({ kind: "error" }));
    return () => {
      live = false;
    };
  }, [docket]);

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 px-5 py-10 md:py-16">
      <div>
        <p className="eyebrow">{f("eyebrow")}</p>
        <h1 className="page-title mt-2">{t.title}</h1>
        <p className="num mt-2 text-lg tracking-wider text-ink-2" data-testid="track-docket">
          {docket}
        </p>
      </div>

      {state.kind === "loading" && (
        <div className="card card-pad flex flex-col gap-3" aria-busy="true" aria-label={f("loading")}>
          <div className="skeleton h-5 w-2/3" />
          <div className="skeleton h-4 w-1/2" />
          <div className="skeleton mt-3 h-24 w-full" />
        </div>
      )}

      {state.kind === "ok" && <Progress data={state.data} t={t} />}

      {(state.kind === "notFound" || state.kind === "error") && (
        <div className="card card-pad flex flex-col gap-4">
          <p role="alert" className="text-ink-2" data-testid="track-error">
            {state.kind === "notFound" ? t.notFound : t.unavailable}
          </p>
          <TrackForm initial={docket} />
        </div>
      )}

      {state.kind === "ok" && (
        <p className="text-sm">
          <Link href="/track" className="link">
            {t.another}
          </Link>
        </p>
      )}
    </main>
  );
}

function Progress({ data, t }: { data: CaseStatusResponse; t: TrackMessages }) {
  const current = CASE_STATUSES.indexOf(data.status);
  const locale = useLocale();
  const f = useTranslations("public.trackForm");
  return (
    <section className="card card-pad flex flex-col gap-6" data-testid="track-result" data-status={data.status}>
      <ol className="flex flex-col gap-0" aria-label={f("progress")}>
        {CASE_STATUSES.map((s, i) => {
          const done = i < current;
          const active = i === current;
          return (
            <li key={s} className="flex gap-3" aria-current={active ? "step" : undefined}>
              <div className="flex flex-col items-center">
                <span className={`grid size-7 shrink-0 place-items-center rounded-full ${done ? "bg-brand text-white" : active ? "bg-brand text-white ring-4 ring-brand-soft" : "border border-line bg-surface text-ink-3"}`} aria-hidden>
                  {done ? <Check className="size-4" /> : active ? <span className="size-2 rounded-full bg-white" /> : <CircleDashed className="size-3.5" />}
                </span>
                {i < CASE_STATUSES.length - 1 && <span className={`my-1 w-px flex-1 ${done ? "bg-brand" : "bg-line"}`} aria-hidden />}
              </div>
              <div className={`pb-5 ${active ? "" : "pt-0.5"}`}>
                <p className={`${active ? "text-lg font-semibold text-ink" : done ? "font-medium text-ink-2" : "text-ink-3"}`}>{t.status[s] ?? s}</p>
                {i === 0 && (
                  <p className="hint">
                    {t.registeredOn} {fmt(data.registeredAt, locale)}
                  </p>
                )}
                {active && i > 0 && (
                  <p className="hint">
                    {t.updatedOn} {fmt(data.updatedAt, locale)}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      <div className="border-t border-line pt-5">
        <h2 className="section-title">{t.supportTitle}</h2>
        {data.support.length === 0 ? (
          <p className="mt-2 text-ink-2" data-testid="no-support">
            {t.noSupport}
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2" data-testid="support-list">
            {data.support.map((s) => (
              <li key={s} className="flex items-center gap-2.5 text-ink">
                <span className="grid size-6 place-items-center rounded-full bg-ok-soft text-ok" aria-hidden>
                  <Check className="size-3.5" />
                </span>
                {t.support[s] ?? s}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
