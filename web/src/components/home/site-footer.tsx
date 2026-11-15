/**
 * Footer of the public pages (task F.2, brief §2.2 G): what this module is and is not, the three
 * helpline numbers, Privacy, How it works and Staff sign-in. Only verified numbers are shown.
 */
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { VictimLang } from "@/contracts/victim";
import { publicPath } from "@/lib/portal";
import { HELPLINES } from "./urgent-help";

export async function SiteFooter({ lang }: { lang: VictimLang }) {
  const t = await getTranslations({ locale: lang });
  return (
    <footer className="border-t border-line bg-surface">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-6 text-base">
        <p className="max-w-[46rem] text-ink-2">{t("home.footer.note")}</p>
        <div className="flex flex-col gap-1">
          <p className="font-semibold">{t("home.footer.numbers")}</p>
          <ul className="flex flex-wrap gap-x-5 gap-y-1">
            {HELPLINES.map((h) => (
              <li key={h.number}>
                <a className="link inline-flex min-h-11 items-center" href={`tel:${h.number}`}>
                  {t(`emergency.${h.labelKey}`)} {h.number}
                </a>
              </li>
            ))}
          </ul>
        </div>
        <ul className="flex flex-wrap gap-x-5 gap-y-1 border-t border-line pt-3">
          <li>
            <Link className="link inline-flex min-h-11 items-center" href={publicPath(lang, "/privacy")}>
              {t("home.nav.privacy")}
            </Link>
          </li>
          <li>
            <Link className="link inline-flex min-h-11 items-center" href={publicPath(lang, "/how-it-works")}>
              {t("home.nav.howItWorks")}
            </Link>
          </li>
          <li>
            <a className="inline-flex min-h-11 items-center text-sm text-ink-2 underline decoration-input underline-offset-4" href="/login">
              {t("home.nav.staff")}
            </a>
          </li>
        </ul>
      </div>
    </footer>
  );
}
