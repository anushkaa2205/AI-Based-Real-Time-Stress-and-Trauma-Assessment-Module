/** Risk band shown as colour AND text everywhere (FR-RISK-05, AC-RISK-04). Staff screens only. */
const LABEL: Record<string, string> = { CRITICAL: "Critical", HIGH: "High", MODERATE: "Moderate", LOW: "Low" };

export function BandBadge({ band }: { band: string | null | undefined }) {
  if (!band) return <span className="band band-none">Not assessed</span>;
  return (
    <span className={`band band-${band}`} data-band={band}>
      {LABEL[band] ?? band}
    </span>
  );
}

export function waitingFor(iso: string, nowMs: number): string {
  const min = Math.max(0, Math.round((nowMs - new Date(iso).getTime()) / 60_000));
  if (min < 1) return "just now";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  return h < 48 ? `${h} h ${min % 60} min` : `${Math.floor(h / 24)} days`;
}
