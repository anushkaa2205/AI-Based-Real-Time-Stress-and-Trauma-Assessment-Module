"use client";

/**
 * Risk-sorted case queue (task 5.2, FR-CASE-01, FR-RISK-05). Live: re-fetches
 * when a case or assessment changes on the queue channel; also every 10 s.
 */
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRealtime } from "@/components/realtime/realtime-provider";
import { BandBadge, waitingFor } from "./band-badge";

interface Item {
  id: string;
  docketNumber: string;
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
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[1.375rem] font-bold leading-tight text-ink">Case queue</h1>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} />
          Only my cases
        </label>
      </div>
      <p className="text-sm text-muted-foreground">Sorted by risk (Critical first), then SVI, then longest waiting. Updates live.</p>
      {error && <p className="text-sm text-destructive">Could not refresh the queue. Retrying…</p>}
      {items === null ? (
        <p>Loading…</p>
      ) : items.length === 0 ? (
        <p>No open cases.</p>
      ) : (
        <div className="card overflow-x-auto">
          <table className="data-table" data-testid="queue">
            <thead className="text-left">
              <tr>
                <th className="p-2">Band</th>
                <th className="p-2">SVI</th>
                <th className="p-2">Docket</th>
                <th className="p-2">Top reason</th>
                <th className="p-2">Waiting</th>
                <th className="p-2">District</th>
                <th className="p-2">Assigned</th>
                <th className="p-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {items.map((c) => (
                <tr key={c.id} className="border-t border-border align-top" data-testid="queue-row" data-band={c.band ?? ""} data-svi={c.svi ?? ""}>
                  <td className="p-2">
                    <div className="flex flex-col gap-1">
                      <BandBadge band={c.band} />
                      {c.openAlert && <span className="text-xs font-semibold text-danger">● Open {c.openAlert.level.toLowerCase()} alert</span>}
                    </div>
                  </td>
                  <td className="p-2 font-mono">
                    {c.svi ?? "–"}
                    {c.limitedConfidence && <span className="ml-1 text-xs text-muted-foreground" title="Limited AI analysis">(limited)</span>}
                  </td>
                  <td className="p-2 font-mono">
                    {caseHref ? (
                      <Link href={`${caseHref}/${c.id}`} className="link">
                        {c.docketNumber}
                      </Link>
                    ) : (
                      c.docketNumber
                    )}
                  </td>
                  <td className="p-2">{c.topReason ?? ""}</td>
                  <td className="p-2 whitespace-nowrap">{waitingFor(c.waitingSince, now)}</td>
                  <td className="p-2">{c.district?.name ?? "–"}</td>
                  <td className="p-2">{c.assignedTo?.name ?? "Unassigned"}</td>
                  <td className="p-2">{c.status.replace(/_/g, " ").toLowerCase()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
