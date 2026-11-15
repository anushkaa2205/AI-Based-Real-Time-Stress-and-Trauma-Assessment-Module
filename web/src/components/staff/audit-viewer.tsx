"use client";

/**
 * Audit log viewer (task 8.6, FR-AUD-01/03): auditor only. Filters, newest first, and a check of
 * the whole hash chain. Metadata holds ids, versions and counts, never victim text.
 */
import { useCallback, useEffect, useState, type FormEvent } from "react";

interface Entry {
  id: string;
  at: string;
  actorType: string;
  actorId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  metadata: Record<string, unknown> | null;
  hash: string;
}

export function AuditViewer() {
  const [items, setItems] = useState<Entry[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [verify, setVerify] = useState<{ ok: boolean; checked: number; firstBrokenId?: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (qs: string, cursor?: string) => {
    const r = await fetch(`/api/v1/staff/admin/audit?${qs}${cursor ? `&cursor=${cursor}` : ""}`, { cache: "no-store" }).catch(() => null);
    if (!r?.ok) return;
    const d = (await r.json()) as { items: Entry[]; nextCursor: string | null };
    setItems((cur) => (cursor ? [...cur, ...d.items] : d.items));
    setNext(d.nextCursor);
  }, []);

  useEffect(() => {
    const first = setTimeout(() => load(""), 0);
    return () => clearTimeout(first);
  }, [load]);

  function search(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const p = new URLSearchParams();
    for (const k of ["action", "entityType", "entityId", "actorId", "from", "to"]) {
      const v = String(f.get(k) ?? "").trim();
      if (v) p.set(k, v);
    }
    setFilter(p.toString());
    void load(p.toString());
  }

  async function runVerify() {
    setBusy(true);
    const r = await fetch("/api/v1/staff/admin/audit/verify", { cache: "no-store" }).catch(() => null);
    setVerify(r?.ok ? await r.json() : null);
    setBusy(false);
  }

  const input = "rounded border border-border bg-background p-1 text-sm";
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={runVerify} disabled={busy} className="rounded bg-primary px-3 py-1 text-sm text-primary-foreground disabled:opacity-60" data-testid="verify-chain">
          {busy ? "Checking…" : "Verify the hash chain"}
        </button>
        {verify && (
          <p role="status" className={`text-sm font-semibold ${verify.ok ? "text-green-800" : "text-red-700"}`} data-testid="verify-result">
            {verify.ok ? `✓ Intact: ${verify.checked} entries checked` : `✗ Broken at entry ${verify.firstBrokenId} (${verify.checked} checked)`}
          </p>
        )}
      </div>
      <form onSubmit={search} className="flex flex-wrap items-end gap-2">
        {[
          ["action", "Action (e.g. case.view)"],
          ["entityType", "Entity type"],
          ["entityId", "Entity id"],
          ["actorId", "Actor id"],
        ].map(([k, l]) => (
          <label key={k} className="flex flex-col text-xs">
            {l}
            <input name={k} className={input} />
          </label>
        ))}
        <label className="flex flex-col text-xs">
          From
          <input name="from" type="date" className={input} />
        </label>
        <label className="flex flex-col text-xs">
          To
          <input name="to" type="date" className={input} />
        </label>
        <button type="submit" className="rounded border border-border px-3 py-1 text-sm">
          Search
        </button>
      </form>
      <table className="text-sm" data-testid="audit-table">
        <thead>
          <tr className="text-left text-xs text-muted-foreground">
            <th className="p-1">When</th>
            <th className="p-1">Who</th>
            <th className="p-1">Action</th>
            <th className="p-1">On</th>
            <th className="p-1">Details</th>
          </tr>
        </thead>
        <tbody>
          {items.map((e) => (
            <tr key={e.id} className="border-t border-border align-top">
              <td className="whitespace-nowrap p-1 text-xs">{new Date(e.at).toLocaleString()}</td>
              <td className="p-1 text-xs">
                {e.actorType.toLowerCase().replace(/_/g, " ")}
                <br />
                <span className="font-mono text-muted-foreground">{e.actorId ?? "–"}</span>
              </td>
              <td className="p-1 font-mono text-xs">{e.action}</td>
              <td className="p-1 text-xs">
                {e.entityType}
                <br />
                <span className="font-mono text-muted-foreground">{e.entityId}</span>
              </td>
              <td className="p-1 font-mono text-[11px]">{e.metadata ? JSON.stringify(e.metadata) : ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {next && (
        <button type="button" onClick={() => load(filter, next)} className="self-start underline">
          Load more
        </button>
      )}
    </div>
  );
}
