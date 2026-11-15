"use client";

/** Emergency options (FR-REC-06): numbers to call and "call me back now". No risk labels. */
import { useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";
import type { EmergencyPanel as Panel } from "@/contracts/victim";
import { api } from "./api";

export function EmergencyPanel({ panel, interactionId }: { panel: Panel; interactionId: string }) {
  const t = useTranslations("emergency");
  const [sent, setSent] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const tc = useTranslations("common");

  async function onCallback(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const phone = String(new FormData(e.currentTarget).get("phone") ?? "");
    setBusy(true);
    setError(false);
    try {
      const r = await api<{ message: string }>("POST", `/interactions/${interactionId}/callback-request`, { phone });
      setSent(r.message);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      role="alert"
      aria-labelledby="emergency-title"
      className="flex flex-col gap-3 border border-danger border-l-[6px] bg-danger-soft p-4 text-ink"
      style={{ borderRadius: 4 }}
    >
      <h2 id="emergency-title" className="text-xl font-bold text-danger">
        {t("title")}
      </h2>
      <p>{panel.message}</p>
      <ul className="flex flex-col gap-2">
        {panel.numbers.map((n) => (
          <li key={n.number}>
            <a
              href={`tel:${n.number}`}
              className="btn btn-danger btn-lg justify-between"
            >
              <span>{n.label}</span>
              <span>
                {t("call")} {n.number}
              </span>
            </a>
          </li>
        ))}
      </ul>
      {panel.callbackAvailable &&
        (sent ? (
          <p className="font-medium">{sent}</p>
        ) : (
          <form onSubmit={onCallback} className="flex flex-col gap-2">
            <label className="flex flex-col gap-1 font-medium">
              {t("callbackPhone")}
              <input
                name="phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                required
                pattern="[0-9 +\-]{10,16}"
                className="field min-h-12 text-lg"
              />
            </label>
            <button type="submit" disabled={busy} className="btn btn-secondary btn-lg border-danger text-danger">
              {t("callbackSend")}
            </button>
            {error && <p>{tc("errorRetry")}</p>}
          </form>
        ))}
    </section>
  );
}
