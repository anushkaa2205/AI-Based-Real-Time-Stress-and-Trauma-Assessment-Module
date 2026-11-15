/**
 * Frame of the public victim-facing pages (/, /how-it-works, /privacy; task F.2): the "Quiet Paper"
 * theme, a skip link, header, main and footer. Server-rendered; no session and no case data.
 * Only the `common` messages go to the browser (for Quick exit).
 */
import { NextIntlClientProvider } from "next-intl";
import { getTranslations } from "next-intl/server";
import type { VictimLang } from "@/contracts/victim";
import { MESSAGES } from "@/core/i18n/messages";
import { SiteFooter } from "./site-footer";
import { SiteHeader, type PublicRoute } from "./site-header";

export async function PublicShell({ lang, path, children }: { lang: VictimLang; path: PublicRoute; children: React.ReactNode }) {
  const t = await getTranslations({ locale: lang, namespace: "home" });
  return (
    <NextIntlClientProvider locale={lang} messages={{ common: MESSAGES[lang].common }} timeZone="Asia/Kolkata">
      <div lang={lang} data-theme="quiet-paper" className="flex min-h-full flex-1 flex-col">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-[6px] focus:bg-surface focus:px-4 focus:py-3"
        >
          {t("skip")}
        </a>
        <SiteHeader lang={lang} path={path} />
        <main id="main" tabIndex={-1} className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 pb-14 pt-8 text-[1.0625rem] leading-relaxed outline-none">
          {children}
        </main>
        <SiteFooter lang={lang} />
      </div>
    </NextIntlClientProvider>
  );
}
