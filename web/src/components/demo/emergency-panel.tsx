import { PhoneCall } from "lucide-react";
import type { EmergencyPanel as Panel } from "@/contracts/interaction";

/** The one risk signal a person may see (CLAUDE.md rule 1): NHAA's scripted emergency options. */
export function EmergencyPanel({ panel }: { panel: Panel }) {
  return (
    <section role="alert" className="rounded-xl border-2 border-danger bg-danger-soft p-4" data-testid="emergency-panel">
      <p className="text-base font-semibold text-danger">{panel.message}</p>
      <ul className="mt-3 grid gap-2 sm:grid-cols-3">
        {panel.numbers.map((n) => (
          <li key={n.number}>
            <a href={`tel:${n.number}`} className="flex items-center gap-2 rounded-lg bg-surface px-3 py-2.5 no-underline shadow-sm">
              <PhoneCall className="size-4 text-danger" aria-hidden />
              <span className="flex flex-col leading-tight">
                <span className="num text-lg font-semibold text-ink">{n.number}</span>
                <span className="text-xs text-ink-2">{n.label}</span>
              </span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
