"use client";

/**
 * On-duty switch (FR-ALR-01, matrix §4). On-duty counsellors receive Critical
 * alerts and may open unassigned cases; off duty, only cases assigned to them.
 */
import { useRouter } from "next/navigation";
import { useState } from "react";

export function DutyToggle({ initial }: { initial: boolean }) {
  const router = useRouter();
  const [onDuty, setOnDuty] = useState(initial);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    setBusy(true);
    const res = await fetch("/api/v1/staff/me/duty", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ isOnDuty: !onDuty }),
    }).catch(() => null);
    if (res?.ok) {
      setOnDuty(!onDuty);
      router.refresh();
    }
    setBusy(false);
  }

  return (
    <div className="flex flex-col gap-1 text-sm">
      <span className={onDuty ? "font-semibold text-green-700" : "text-muted-foreground"} role="status" data-testid="duty-status">
        {onDuty ? "● On duty" : "○ Off duty"}
      </span>
      <button type="button" onClick={toggle} disabled={busy} className="rounded-md border border-border px-2 py-1 disabled:opacity-60">
        {onDuty ? "Go off duty" : "Go on duty"}
      </button>
    </div>
  );
}
