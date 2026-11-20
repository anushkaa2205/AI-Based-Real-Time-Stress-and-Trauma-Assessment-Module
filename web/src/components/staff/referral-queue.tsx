"use client";

/**
 * Referral queue (tasks 6.3–6.6, FR-DSH-04/05, FR-REC-08). Shows ONLY the ReferralDto:
 * docket, action, location hint, contact route, urgency, due time, status.
 * There is no narrative, SVI or indicator here, and the API never sends any (rule 8).
 */
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { useRealtime } from "@/components/realtime/realtime-provider";
import { useEnumLabel } from "./use-labels";
import { REFERRAL_STATUSES } from "@/models/enums";

interface Referral {
  id: string;
  docketNumber: string;
  isPortal?: boolean;
  type: string;
  actionRequested: string;
  locationHint?: string;
  contactRoute: string;
  urgency: string;
  dueAt?: string;
  status: "PENDING" | "ACCEPTED" | "IN_PROGRESS" | "DONE" | "DECLINED";
  outcomeNote?: string;
  createdAt: string;
}

const NEXT: Partial<Record<Referral["status"], { to: Referral["status"]; label: "accept" | "start" | "markDone" }>> = {
  PENDING: { to: "ACCEPTED", label: "accept" },
  ACCEPTED: { to: "IN_PROGRESS", label: "start" },
  IN_PROGRESS: { to: "DONE", label: "markDone" },
};
const OPEN = new Set(["PENDING", "ACCEPTED", "IN_PROGRESS"]);
const POLL_MS = 15_000;

/**
 * Police and welfare cards grouped by status, in the order of REFERRAL_STATUSES (pending → accepted →
 * in progress → done → declined; task H.7, plan §4.5–4.6). Empty groups are left out; order inside a group is kept.
 */
export function groupByStatus<T extends { status: string }>(items: readonly T[]): { status: string; items: T[] }[] {
  return REFERRAL_STATUSES.map((status) => ({ status: status as string, items: items.filter((r) => r.status === status) })).filter((g) => g.items.length > 0);
}

/** Earliest due first (so the most overdue is on top); no due time goes last; ties keep their order (H.7). */
export function byDue<T extends { dueAt?: string }>(items: readonly T[]): T[] {
  const due = (r: T) => {
    const ms = r.dueAt ? new Date(r.dueAt).getTime() : NaN;
    return Number.isFinite(ms) ? ms : Infinity;
  };
  return [...items].sort((a, b) => due(a) - due(b));
}

/** Finished groups start closed, so the open work stays at the top (H.7). */
export const COLLAPSED_STATUSES: readonly string[] = ["DONE", "DECLINED"];

export function ReferralQueue({
  channels,
  query = "",
  canUpdate,
  emptyText,
  title,
}: {
  channels: string[];
  query?: string;
  canUpdate: boolean;
  emptyText?: string;
  title?: string;
}) {
  const [items, setItems] = useState<Referral[] | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [declining, setDeclining] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const t = useTranslations("staff.referrals");
  const tc = useTranslations("staff.common");
  const e = useEnumLabel();
  /** Police and welfare pages list every referral with no filter: those are grouped by status (H.7). */
  const grouped = !query;

  const load = useCallback(async () => {
    const res = await fetch(`/api/v1/staff/referrals${query}`, { cache: "no-store" }).catch(() => null);
    if (res?.ok) setItems(((await res.json()) as { items: Referral[] }).items);
    else if (res) setMsg(t("loadFailed"));
    setNow(Date.now());
  }, [query, t]);

  useEffect(() => {
    const first = setTimeout(load, 0);
    const timer = setInterval(load, POLL_MS);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [load]);
  useRealtime(channels, (env) => {
    if (env.event.startsWith("referral.")) void load();
  });

  async function update(id: string, body: Record<string, string>) {
    const res = await fetch(`/api/v1/staff/referrals/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => null);
    const data = (await res?.json().catch(() => ({}))) as { detail?: string; title?: string } | undefined;
    setMsg(res?.ok ? t("updated", { status: e("referralStatus", body.status ?? "") }) : (data?.detail ?? data?.title ?? t("updateFailed")));
    setDeclining(null);
    void load();
  }

  return (
    <section className="flex flex-col gap-2">
      {title && <h2 className="text-base font-bold text-ink">{title}</h2>}
      {msg && (
        <p role="status" className="text-sm" data-testid="referral-message">
          {msg}
        </p>
      )}
      {items === null ? (
        <div className="skeleton h-20 w-full" role="status" aria-busy="true">
          <span className="sr-only">{tc("loading")}</span>
        </div>
      ) : items.length === 0 ? (
        <div className="empty">{emptyText ?? t("empty")}</div>
      ) : (
        <div className="flex flex-col gap-4" data-testid="referrals">
        {(grouped ? groupByStatus(items).map((x) => ({ ...x, items: byDue(x.items) })) : [{ status: "", items }]).map((g) => {
        const heading = (
          <h3 className="mt-1 inline text-sm font-semibold text-ink-2 first-letter:uppercase">
            {e("referralStatus", g.status)} ({g.items.length})
          </h3>
        );
        const list = (
        <ul className="flex flex-col gap-2">
          {g.items.map((r) => {
            const overdue = !!r.dueAt && OPEN.has(r.status) && new Date(r.dueAt).getTime() < now;
            const next = NEXT[r.status];
            return (
              <li key={r.id} data-testid="referral-row" data-status={r.status} className="card flex flex-col gap-1.5 px-4 py-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="num font-medium text-ink">{r.docketNumber}</span>
                  <span className="tag">{e("support", r.type)}</span>
                  <span className={`tag ${r.urgency === "IMMEDIATE" || r.urgency === "WITHIN_15_MIN" ? "tag-danger" : ""}`}>{e("urgency", r.urgency)}</span>
                  <span className={`tag ${r.status === "DONE" ? "tag-ok" : r.status === "DECLINED" ? "" : "tag-brand"}`}>{e("referralStatus", r.status)}</span>
                  {r.dueAt && (
                    <span className={`text-xs ${overdue ? "font-semibold text-danger" : "text-ink-3"}`}>
                      {overdue ? t("overdueSince", { when: new Date(r.dueAt).toLocaleString() }) : t("due", { when: new Date(r.dueAt).toLocaleString() })}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-ink">
                  <strong className="text-ink-2">{t("action")}</strong> {r.actionRequested}
                </p>
                {r.locationHint && (
                  <p>
                    <strong>{t("where")}</strong> {r.locationHint}
                  </p>
                )}
                <p>
                  <strong>{t("contact")}</strong> {r.contactRoute}
                </p>
                {r.outcomeNote && <p className="text-xs text-ink-3">{t("outcome", { text: r.outcomeNote })}</p>}
                {canUpdate && OPEN.has(r.status) && (
                  <div className="flex flex-wrap items-center gap-2">
                    {next && (
                      <button type="button" className="btn btn-primary btn-sm" onClick={() => update(r.id, { status: next.to })}>
                        {t(next.label)}
                      </button>
                    )}
                    {declining === r.id ? (
                      <form
                        className="flex gap-1"
                        onSubmit={(e) => {
                          e.preventDefault();
                          void update(r.id, { status: "DECLINED", declinedReason: String(new FormData(e.currentTarget).get("reason") ?? "") });
                        }}
                      >
                        <input name="reason" placeholder={t("declineReason")} className="field text-xs" />
                        <button type="submit" className="btn btn-secondary btn-sm">
                          {t("decline")}
                        </button>
                      </form>
                    ) : (
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => setDeclining(r.id)}>
                        {t("declineOpen")}
                      </button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        );
        if (!grouped) return <div key="all">{list}</div>;
        // Done and Declined start closed: the heading (with its count) is the toggle, so no new text is needed.
        return COLLAPSED_STATUSES.includes(g.status) ? (
          <details key={g.status} className="flex flex-col gap-2" data-testid="referral-group" data-group={g.status}>
            <summary className="cursor-pointer">{heading}</summary>
            <div className="mt-2">{list}</div>
          </details>
        ) : (
          <div key={g.status} className="flex flex-col gap-2" data-testid="referral-group" data-group={g.status}>
            {heading}
            {list}
          </div>
        );
        })}
        </div>
      )}
    </section>
  );
}
