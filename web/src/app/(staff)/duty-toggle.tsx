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
      <span className={`flex items-center gap-2 px-1 ${onDuty ? "font-semibold text-white" : "text-white/70"}`} role="status" data-testid="duty-status">
        <span aria-hidden className={`inline-block size-2.5 rounded-[2px] ${onDuty ? "bg-[#6fcf7f]" : "border border-white/60"}`} />
        {onDuty ? "On duty" : "Off duty"}
      </span>
      <button type="button" onClick={toggle} disabled={busy} className="btn btn-sm w-full border-white/30 bg-white/10 text-white hover:bg-white/20">
        {onDuty ? "Go off duty" : "Go on duty"}
      </button>
    </div>
  );
}
