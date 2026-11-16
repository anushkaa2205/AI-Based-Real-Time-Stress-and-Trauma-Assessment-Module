"use client";

/**
 * High and Critical cases in the officer's district (task 6.6, FR-DSH-03).
 * Band and SVI only: the API sends the reduced shape (no reason, no evidence, no transcript).
 */
import { useCallback, useEffect, useState } from "react";
import { useRealtime } from "@/components/realtime/realtime-provider";
import { BandBadge, waitingFor } from "./band-badge";
import { DemoMark } from "./demo-mark";

interface Row {
  id: string;
  docketNumber: string;
  isDemo?: boolean;
  band: string | null;
  svi: number | null;
  status: string;
  waitingSince: string;
  openAlert: { level: string; escalationLevel: number } | null;
}

const POLL_MS = 15_000;
const MAX_PAGES = 10;

export function DistrictCases({ channels }: { channels: string[] }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    // A district officer must see every open High and Critical case, not just the first page.
    const all: Row[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < MAX_PAGES; page++) {
      const res: Response | null = await fetch(
        `/api/v1/staff/cases?band=HIGH,CRITICAL&status=NEW,UNDER_REVIEW,ACTION_TAKEN,FOLLOW_UP_SCHEDULED&limit=100${cursor ? `&cursor=${cursor}` : ""}`,
        { cache: "no-store" },
      ).catch(() => null);
      if (!res?.ok) break;
      const d = (await res.json()) as { items: Row[]; nextCursor: string | null };
      all.push(...d.items);
      cursor = d.nextCursor;
      if (!cursor) break;
    }
    setRows(all);
    setNow(Date.now());
  }, []);

  useEffect(() => {
    const first = setTimeout(load, 0);
    const timer = setInterval(load, POLL_MS);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [load]);
  useRealtime(channels, (env) => {
    if (env.event.startsWith("case.") || env.event === "assessment.updated") void load();
  });

  if (rows === null) return <div className="skeleton h-24 w-full" aria-busy="true" />;
  if (rows.length === 0) return <div className="empty">No High or Critical cases open in your district</div>;
  return (
    <table className="data-table" data-testid="district-cases">
      <thead className="bg-surface-2">
        <tr>
          <th className="p-2">Band</th>
          <th className="p-2">SVI</th>
          <th className="p-2">Docket</th>
          <th className="p-2">Status</th>
          <th className="p-2">Waiting</th>
          <th className="p-2">Alert</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id} className="border-t border-border" data-testid="district-case-row">
            <td className="p-2">
              <BandBadge band={r.band} />
            </td>
            <td className="p-2 num">{r.svi ?? "–"}</td>
            <td className="p-2 num">
              {r.docketNumber} <DemoMark show={r.isDemo} />
            </td>
            <td className="p-2">{r.status.replace(/_/g, " ").toLowerCase()}</td>
            <td className="p-2">{waitingFor(r.waitingSince, now)}</td>
            <td className="p-2 text-xs">{r.openAlert ? `${r.openAlert.level.toLowerCase()}${r.openAlert.escalationLevel ? `, escalated (level ${r.openAlert.escalationLevel})` : ""}` : "–"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
