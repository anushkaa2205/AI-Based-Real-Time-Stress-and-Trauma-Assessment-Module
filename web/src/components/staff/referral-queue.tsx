"use client";

/**
 * Referral queue (tasks 6.3–6.6, FR-DSH-04/05, FR-REC-08). Shows ONLY the ReferralDto:
 * docket, action, location hint, contact route, urgency, due time, status.
 * There is no narrative, SVI or indicator here, and the API never sends any (rule 8).
 */
import { useCallback, useEffect, useState } from "react";
import { useRealtime } from "@/components/realtime/realtime-provider";
import { DemoMark } from "./demo-mark";

interface Referral {
  id: string;
  docketNumber: string;
  isDemo?: boolean;
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

const lower = (s: string) => s.replace(/_/g, " ").toLowerCase();
const NEXT: Partial<Record<Referral["status"], { to: Referral["status"]; label: string }>> = {
  PENDING: { to: "ACCEPTED", label: "Accept" },
  ACCEPTED: { to: "IN_PROGRESS", label: "Start" },
  IN_PROGRESS: { to: "DONE", label: "Mark done" },
};
const OPEN = new Set(["PENDING", "ACCEPTED", "IN_PROGRESS"]);
const POLL_MS = 15_000;

export function ReferralQueue({
  channels,
  query = "",
  canUpdate,
  emptyText = "No referrals.",
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

  const load = useCallback(async () => {
    const res = await fetch(`/api/v1/staff/referrals${query}`, { cache: "no-store" }).catch(() => null);
    if (res?.ok) setItems(((await res.json()) as { items: Referral[] }).items);
    else if (res) setMsg("Could not load referrals.");
    setNow(Date.now());
  }, [query]);

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
    setMsg(res?.ok ? `Referral ${lower(body.status ?? "")}.` : (data?.detail ?? data?.title ?? "Update failed"));
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
        <p className="text-muted-foreground">Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-muted-foreground">{emptyText}</p>
      ) : (
        <ul className="flex flex-col gap-2" data-testid="referrals">
          {items.map((r) => {
            const overdue = !!r.dueAt && OPEN.has(r.status) && new Date(r.dueAt).getTime() < now;
            const next = NEXT[r.status];
            return (
              <li key={r.id} data-testid="referral-row" data-status={r.status} className="card flex flex-col gap-1 p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono">{r.docketNumber}</span>
                  <DemoMark show={r.isDemo} />
                  <span className="tag">{lower(r.type)}</span>
                  <span className={`tag ${r.urgency === "IMMEDIATE" || r.urgency === "WITHIN_15_MIN" ? "bg-danger text-white" : ""}`}>{lower(r.urgency)}</span>
                  <span className="text-xs">Status: {lower(r.status)}</span>
                  {r.dueAt && (
                    <span className={`text-xs ${overdue ? "font-semibold text-danger" : "text-muted-foreground"}`}>
                      {overdue ? "Overdue since " : "Due "}
                      {new Date(r.dueAt).toLocaleString()}
                    </span>
                  )}
                </div>
                <p>
                  <strong>Action:</strong> {r.actionRequested}
                </p>
                {r.locationHint && (
                  <p>
                    <strong>Where:</strong> {r.locationHint}
                  </p>
                )}
                <p>
                  <strong>Contact:</strong> {r.contactRoute}
                </p>
                {r.outcomeNote && <p className="text-xs text-muted-foreground">Outcome: {r.outcomeNote}</p>}
                {canUpdate && OPEN.has(r.status) && (
                  <div className="flex flex-wrap items-center gap-2">
                    {next && (
                      <button type="button" className="btn btn-primary btn-sm" onClick={() => update(r.id, { status: next.to })}>
                        {next.label}
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
                        <input name="reason" placeholder="Reason for declining" className="field text-xs" />
                        <button type="submit" className="btn btn-secondary btn-sm">
                          Decline
                        </button>
                      </form>
                    ) : (
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => setDeclining(r.id)}>
                        Decline…
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
