"use client";

/**
 * Approval inbox (task 6.1, FR-REC-05). Proposals wait here until a counsellor or
 * supervisor (or, for police and protection types, the district officer) decides.
 * Auto-triggered emergency support is listed separately for its review afterwards.
 */
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { BandBadge } from "./band-badge";
import { RecommendationActions, type RecLike } from "./recommendation-actions";
import { DemoMark } from "./demo-mark";
import { useEnumLabel } from "./use-labels";
import { URGENCIES } from "@/models/enums";

interface Item extends RecLike {
  caseId: string;
  docketNumber: string;
  isDemo?: boolean;
  band: string | null;
  reason: string;
  urgency: string;
  dueAt?: string;
  legalBasis?: string;
}

const POLL_MS = 15_000;
const PAGE = 50;

/**
 * Waiting proposals grouped by urgency, most urgent first (task H.7, plan §4.3). Empty groups are
 * left out; an urgency outside URGENCIES goes last, in its own group. Order inside a group is kept.
 */
export function groupByUrgency<T extends { urgency: string }>(items: readonly T[]): { urgency: string; items: T[] }[] {
  const rank = (u: string) => {
    const i = (URGENCIES as readonly string[]).indexOf(u);
    return i === -1 ? URGENCIES.length : i;
  };
  const groups = new Map<string, T[]>();
  for (const it of items) groups.set(it.urgency, [...(groups.get(it.urgency) ?? []), it]);
  return [...groups.entries()].sort(([a], [b]) => rank(a) - rank(b)).map(([urgency, list]) => ({ urgency, items: list }));
}

function List({ items, caseHref, onDone }: { items: Item[]; caseHref: string | null; onDone: (m: string) => void }) {
  const e = useEnumLabel();
  const t = useTranslations("staff");
  return (
    <ul className="flex flex-col gap-2">
      {items.map((r) => (
        <li key={r.id} data-testid="approval-row" data-type={r.type} className="card flex flex-col gap-1 p-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            {caseHref ? (
              <Link href={`${caseHref}/${r.caseId}`} className="num underline underline-offset-4">
                {r.docketNumber}
              </Link>
            ) : (
              <span className="num">{r.docketNumber}</span>
            )}
            <DemoMark show={r.isDemo} />
            <BandBadge band={r.band} />
            <strong>{e("support", r.type)}</strong>
            <span className="text-xs">{e("urgency", r.urgency)}</span>
            <span className="text-xs text-ink-3">→ {e("roles", r.responsibleRole)}</span>
            {r.dueAt && <span className="text-xs text-ink-3">{t("approvals.due", { when: new Date(r.dueAt).toLocaleString() })}</span>}
          </div>
          <p className="text-xs text-ink-3">{r.reason}</p>
          {r.legalBasis && <p className="text-xs text-ink-3">{t("case.basis", { text: r.legalBasis })}</p>}
          <RecommendationActions rec={r} onDone={onDone} />
        </li>
      ))}
    </ul>
  );
}

export function ApprovalInbox({ caseHref, showReviews = true }: { caseHref: string | null; showReviews?: boolean }) {
  const [proposed, setProposed] = useState<Item[] | null>(null);
  const [reviews, setReviews] = useState<Item[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  /** Pages of PAGE items shown; "Load more" adds one, so no proposal is ever out of reach. */
  const [pages, setPages] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const t = useTranslations("staff");
  const e = useEnumLabel();

  const load = useCallback(async () => {
    const get = async (q: string, maxPages: number) => {
      const items: Item[] = [];
      let cursor: string | null = null;
      for (let i = 0; i < maxPages; i++) {
        const res = await fetch(`/api/v1/staff/recommendations${q}&limit=${PAGE}${cursor ? `&cursor=${cursor}` : ""}`, { cache: "no-store" }).catch(() => null);
        if (!res?.ok) break;
        const d = (await res.json()) as { items: Item[]; nextCursor: string | null };
        items.push(...d.items);
        cursor = d.nextCursor;
        if (!cursor) break;
      }
      return { items, more: !!cursor };
    };
    const [p, r] = await Promise.all([get("?status=PROPOSED", pages), showReviews ? get("?needsReview=true", 1) : Promise.resolve({ items: [], more: false })]);
    setProposed(p.items);
    setHasMore(p.more);
    setReviews(r.items);
  }, [showReviews, pages]);

  useEffect(() => {
    const first = setTimeout(load, 0);
    const timer = setInterval(load, POLL_MS);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [load]);

  const done = (m: string) => {
    setMsg(m);
    void load();
  };

  return (
    <div className="flex flex-col gap-4" data-testid="approval-inbox">
      {msg && (
        <p role="status" className="text-sm" data-testid="approval-message">
          {msg}
        </p>
      )}
      {showReviews && reviews.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="section-title">{t("approvals.reviewTitle", { n: reviews.length })}</h2>
          <List items={reviews} caseHref={caseHref} onDone={done} />
        </section>
      )}
      <section className="flex flex-col gap-2">
        <h2 className="section-title">
          {t("approvals.waiting")}
          {proposed ? ` (${proposed.length})` : ""}
        </h2>
        {proposed === null ? (
          <div className="skeleton h-16 w-full" aria-busy="true" aria-label={t("common.loading")} />
        ) : proposed.length === 0 ? (
          <div className="empty">{t("approvals.empty")}</div>
        ) : (
          groupByUrgency(proposed).map((g) => (
            <div key={g.urgency} className="flex flex-col gap-2" data-testid="approval-group" data-group={g.urgency}>
              <h3 className="mt-1 text-sm font-semibold text-ink-2 first-letter:uppercase">
                {e("urgency", g.urgency)} ({g.items.length})
              </h3>
              <List items={g.items} caseHref={caseHref} onDone={done} />
            </div>
          ))
        )}
        {hasMore && (
          <button type="button" onClick={() => setPages((n) => n + 1)} className="link self-start text-sm" data-testid="inbox-more">
            {t("approvals.loadMore")}
          </button>
        )}
      </section>
    </div>
  );
}
