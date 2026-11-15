"use client";

/**
 * Approval inbox (task 6.1, FR-REC-05). Proposals wait here until a counsellor or
 * supervisor (or, for police and protection types, the district officer) decides.
 * Auto-triggered emergency support is listed separately for its review afterwards.
 */
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { BandBadge } from "./band-badge";
import { RecommendationActions, type RecLike } from "./recommendation-actions";

interface Item extends RecLike {
  caseId: string;
  docketNumber: string;
  band: string | null;
  reason: string;
  urgency: string;
  dueAt?: string;
  legalBasis?: string;
}

const lower = (s: string) => s.replace(/_/g, " ").toLowerCase();
const POLL_MS = 15_000;
const PAGE = 50;

function List({ items, caseHref, onDone }: { items: Item[]; caseHref: string | null; onDone: (m: string) => void }) {
  return (
    <ul className="flex flex-col gap-2">
      {items.map((r) => (
        <li key={r.id} data-testid="approval-row" data-type={r.type} className="flex flex-col gap-1 rounded-md border border-border p-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            {caseHref ? (
              <Link href={`${caseHref}/${r.caseId}`} className="font-mono underline underline-offset-4">
                {r.docketNumber}
              </Link>
            ) : (
              <span className="font-mono">{r.docketNumber}</span>
            )}
            <BandBadge band={r.band} />
            <strong>{lower(r.type)}</strong>
            <span className="text-xs">{lower(r.urgency)}</span>
            <span className="text-xs text-muted-foreground">→ {lower(r.responsibleRole)}</span>
            {r.dueAt && <span className="text-xs text-muted-foreground">due {new Date(r.dueAt).toLocaleString()}</span>}
          </div>
          <p className="text-xs text-muted-foreground">{r.reason}</p>
          {r.legalBasis && <p className="text-xs text-muted-foreground">Basis: {r.legalBasis}</p>}
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
          <h2 className="font-semibold">Emergency support to review ({reviews.length})</h2>
          <List items={reviews} caseHref={caseHref} onDone={done} />
        </section>
      )}
      <section className="flex flex-col gap-2">
        <h2 className="font-semibold">Waiting for approval{proposed ? ` (${proposed.length})` : ""}</h2>
        {proposed === null ? (
          <p className="text-muted-foreground">Loading…</p>
        ) : proposed.length === 0 ? (
          <p className="text-muted-foreground">Nothing waiting.</p>
        ) : (
          <List items={proposed} caseHref={caseHref} onDone={done} />
        )}
        {hasMore && (
          <button type="button" onClick={() => setPages((n) => n + 1)} className="self-start text-sm underline underline-offset-4" data-testid="inbox-more">
            Load more
          </button>
        )}
      </section>
    </div>
  );
}
