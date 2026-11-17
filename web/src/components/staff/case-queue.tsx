"use client";

/**
 * Risk-sorted case queue (task 5.2, FR-CASE-01, FR-RISK-05). Live: re-fetches
 * when a case or assessment changes on the queue channel; also every 10 s.
 */
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { useRealtime } from "@/components/realtime/realtime-provider";
import { BandBadge, useWaitingFor } from "./band-badge";
import { DemoMark } from "./demo-mark";
import { EmptyState, PageHeader, TableSkeleton } from "./page-header";

import { CASE_STATUSES, CHANNELS } from "@/models/enums";

interface Item {
  id: string;
  docketNumber: string;
  isDemo?: boolean;
  band: string | null;
  svi: number | null;
  status: string;
  channel?: string;
  language?: string;
  district: { id: string; name: string } | null;
  assignedTo: { id: string; name: string } | null;
  waitingSince: string;
  topReason?: string;
  limitedConfidence: boolean;
  openAlert: { id: string; level: string; escalationLevel: number } | null;
}

export function CaseQueue({ channels, caseHref }: { channels: string[]; caseHref: string | null }) {
  const [items, setItems] = useState<Item[] | null>(null);
  const [mine, setMine] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState(false);
  const t = useTranslations("staff");
  const waitingFor = useWaitingFor();
  const channelLabel = (c: string) => ((CHANNELS as readonly string[]).includes(c) ? t(`channels.${c}`) : c);
  const statusLabel = (s: string) => ((CASE_STATUSES as readonly string[]).includes(s) ? t(`status.${s}`) : s);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/v1/staff/cases?limit=100${mine ? "&assignedTo=me" : ""}`, { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      setItems(((await res.json()) as { items: Item[] }).items);
      setNow(Date.now());
      setError(false);
    } catch {
      setError(true);
    }
  }, [mine]);

  useEffect(() => {
    const first = setTimeout(load, 0);
    const timer = setInterval(load, 10_000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [load]);

  useRealtime(channels, (env) => {
    if (env.event === "case.updated" || env.event === "case.created" || env.event === "assessment.updated") void load();
  });

  return (
    <section className="flex flex-col gap-5">
      <PageHeader title={t("queue.title")} lead={t("queue.lead")}>
        <label className="flex items-center gap-2 text-sm text-ink-2">
          <input type="checkbox" className="size-4 accent-brand" checked={mine} onChange={(e) => setMine(e.target.checked)} />
          {t("queue.mine")}
        </label>
      </PageHeader>
      {error && (
        <p role="status" className="text-sm text-warn">
          {t("queue.refreshFailed")}
        </p>
      )}
      {items === null ? (
        <TableSkeleton cols={6} />
      ) : items.length === 0 ? (
        <EmptyState>
          <p className="font-medium text-ink-2">{t("queue.empty")}</p>
          <p className="text-sm">{t("queue.emptyHint")}</p>
        </EmptyState>
      ) : (
        <div className="card overflow-x-auto">
          <table className="data-table" data-testid="queue">
            <thead>
              <tr>
                <th>{t("queue.band")}</th>
                <th className="text-right">{t("queue.svi")}</th>
                <th>{t("queue.docket")}</th>
                <th>{t("queue.waiting")}</th>
                <th>{t("queue.reason")}</th>
                <th>{t("queue.channel")}</th>
                <th>{t("queue.assigned")}</th>
                <th>{t("queue.district")}</th>
                <th>{t("queue.status")}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((c) => (
                <tr key={c.id} data-testid="queue-row" data-band={c.band ?? ""} data-svi={c.svi ?? ""}>
                  <td>
                    <div className="flex flex-col items-start gap-1">
                      <BandBadge band={c.band} />
                      {c.openAlert && <span className="text-xs font-semibold text-danger">{t("queue.openAlert", { level: t(`bands.${c.openAlert.level}`).toLowerCase() })}</span>}
                    </div>
                  </td>
                  <td className="num text-right">
                    {c.svi ?? "–"}
                    {c.limitedConfidence && (
                      <span className="ml-1 text-xs text-ink-3" title={t("queue.limitedTitle")}>
                        {t("queue.limited")}
                      </span>
                    )}
                  </td>
                  <td className="num whitespace-nowrap">
                    {caseHref ? (
                      <Link href={`${caseHref}/${c.id}`} className="link font-medium">
                        {c.docketNumber}
                      </Link>
                    ) : (
                      c.docketNumber
                    )}{" "}
                    <DemoMark show={c.isDemo} />
                  </td>
                  <td className="whitespace-nowrap text-ink-2">{waitingFor(c.waitingSince, now)}</td>
                  <td className="max-w-[18rem] text-ink-2">{c.topReason ?? ""}</td>
                  <td className="text-ink-2">{c.channel ? channelLabel(c.channel) : "–"}</td>
                  <td className={c.assignedTo ? "" : "text-ink-3"}>{c.assignedTo?.name ?? t("queue.unassigned")}</td>
                  <td className="text-ink-2">{c.district?.name ?? "–"}</td>
                  <td>
                    <span className="tag">{statusLabel(c.status)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
