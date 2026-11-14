/** Risk band shown as colour AND text everywhere (FR-RISK-05, AC-RISK-04). Staff screens only. */
const STYLE: Record<string, string> = {
  CRITICAL: "bg-red-700 text-white",
  HIGH: "bg-orange-500 text-black",
  MODERATE: "bg-yellow-300 text-black",
  LOW: "bg-green-200 text-green-950",
};
const LABEL: Record<string, string> = { CRITICAL: "Critical", HIGH: "High", MODERATE: "Moderate", LOW: "Low" };

export function BandBadge({ band }: { band: string | null | undefined }) {
  if (!band) return <span className="rounded px-2 py-0.5 text-xs font-semibold bg-muted text-muted-foreground">Not assessed</span>;
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-bold uppercase tracking-wide ${STYLE[band] ?? "bg-muted"}`} data-band={band}>
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
