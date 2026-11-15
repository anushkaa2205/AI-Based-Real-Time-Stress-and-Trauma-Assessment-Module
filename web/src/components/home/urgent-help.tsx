/**
 * "Are you in immediate danger?" (task F.2, brief §2.2 D). Reuses the approved emergency.* copy and
 * the three numbers from FR-REC (112, Tele-MANAS 14416, NHAA 14566). The links only open the phone's
 * dialler: nothing here contacts anyone on the person's behalf, and the copy says so.
 */
import { getTranslations } from "next-intl/server";
import type { VictimLang } from "@/contracts/victim";

export const HELPLINES = [
  { number: "112", labelKey: "police" },
  { number: "14416", labelKey: "teleManas" },
  { number: "14566", labelKey: "nhaa" },
] as const;

export async function UrgentHelp({ lang }: { lang: VictimLang }) {
  const t = await getTranslations({ locale: lang });
  return (
    <section
      id="urgent"
      aria-labelledby="urgent-title"
      tabIndex={-1}
      className="flex scroll-mt-4 flex-col gap-4 rounded-[6px] border border-input border-l-[6px] border-l-danger bg-surface p-5 outline-none"
      data-testid="urgent-help"
    >
      <h2 id="urgent-title" className="text-[1.5rem] font-bold leading-snug">
        {t("home.urgent.title")}
      </h2>
      <p>{t("emergency.message")}</p>
      <ul className="grid gap-3 sm:grid-cols-3">
        {HELPLINES.map((h) => (
          <li key={h.number} className="flex">
            <a
              href={`tel:${h.number}`}
              className="btn btn-secondary btn-lg h-full flex-col items-start justify-center gap-0.5 text-left text-ink hover:border-danger"
            >
              <span className="text-base font-medium">{t(`emergency.${h.labelKey}`)}</span>
              <span className="font-mono text-[1.375rem] font-bold tracking-wide text-danger">{h.number}</span>
            </a>
          </li>
        ))}
      </ul>
      <p className="text-base text-ink-2">{t("home.urgent.note")}</p>
    </section>
  );
}
