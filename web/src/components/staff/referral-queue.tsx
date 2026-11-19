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
  const e = useEnumLabel();

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
        <p className="text-ink-3">{t("loading")}</p>
      ) : items.length === 0 ? (
        <div className="empty">{emptyText ?? t("empty")}</div>
      ) : (
        <ul className="flex flex-col gap-2" data-testid="referrals">
          {items.map((r) => {
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
      )}
    </section>
  );
}
