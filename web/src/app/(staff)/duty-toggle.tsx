"use client";

/**
 * On-duty switch (FR-ALR-01, matrix §4). On-duty counsellors receive Critical
 * alerts and may open unassigned cases; off duty, only cases assigned to them.
 */
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function DutyToggle({ initial }: { initial: boolean }) {
  const router = useRouter();
  const [onDuty, setOnDuty] = useState(initial);
  const [busy, setBusy] = useState(false);
  const t = useTranslations("staff.shell");

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
    <div className="flex items-center justify-between gap-2 rounded-lg bg-white/6 px-3 py-2 text-sm">
      <span className={`flex items-center gap-2 ${onDuty ? "font-semibold text-white" : "text-white/70"}`} role="status" data-testid="duty-status">
        <span aria-hidden className={`inline-block size-2.5 rounded-full ${onDuty ? "bg-emerald-400" : "border border-white/50"}`} />
        {onDuty ? t("onDuty") : t("offDuty")}
      </span>
      <button type="button" onClick={toggle} disabled={busy} className="btn btn-sm btn-ghost-light">
        {onDuty ? t("goOff") : t("goOn")}
      </button>
    </div>
  );
}
