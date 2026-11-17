/** Risk band shown as colour AND text everywhere (FR-RISK-05, AC-RISK-04). Staff screens only. Labels in the site language (P.8). */
import { useTranslations } from "next-intl";
import { RISK_BANDS } from "@/models/enums";

export function BandBadge({ band }: { band: string | null | undefined }) {
  const t = useTranslations("staff.bands");
  if (!band) return <span className="band band-none">{t("none")}</span>;
  return (
    <span className={`band band-${band}`} data-band={band}>
      {(RISK_BANDS as readonly string[]).includes(band) ? t(band) : band}
    </span>
  );
}

/** How long a case has waited, in whole units (pure; the caller words it). */
export function waitingParts(iso: string, nowMs: number): { kind: "now" } | { kind: "min"; n: number } | { kind: "hm"; h: number; m: number } | { kind: "days"; n: number } {
  const min = Math.max(0, Math.round((nowMs - new Date(iso).getTime()) / 60_000));
  if (min < 1) return { kind: "now" };
  if (min < 60) return { kind: "min", n: min };
  const h = Math.floor(min / 60);
  return h < 48 ? { kind: "hm", h, m: min % 60 } : { kind: "days", n: Math.floor(h / 24) };
}

/** `waitingFor(iso, now)` in the site language. */
export function useWaitingFor(): (iso: string, nowMs: number) => string {
  const t = useTranslations("staff.common");
  return (iso, nowMs) => {
    const w = waitingParts(iso, nowMs);
    if (w.kind === "now") return t("justNow");
    if (w.kind === "min") return t("minutes", { n: w.n });
    if (w.kind === "hm") return t("hoursMinutes", { h: w.h, m: w.m });
    return t("days", { n: w.n });
  };
}
