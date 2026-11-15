/** Victim screens (task 3.7): language from the URL, all text from messages/*.json. */
import { NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { VICTIM_LANGS, type VictimLang } from "@/contracts/victim";
import { MESSAGES } from "@/core/i18n/messages";
import { QuickExit } from "@/components/victim/quick-exit";

export function generateStaticParams() {
  return VICTIM_LANGS.map((locale) => ({ locale }));
}

export default async function VictimLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!(VICTIM_LANGS as readonly string[]).includes(locale)) notFound();
  const lang = locale as VictimLang;
  setRequestLocale(lang);
  const t = await getTranslations({ locale: lang, namespace: "emergency" });
  const ta = await getTranslations({ locale: lang, namespace: "app" });
  return (
    <NextIntlClientProvider locale={lang} messages={MESSAGES[lang]} timeZone="Asia/Kolkata">
      <div lang={lang} className="flex min-h-full flex-1 flex-col">
        <header className="sticky top-0 z-50 border-b border-line bg-white">
          <div className="mx-auto flex w-full max-w-2xl items-center justify-between gap-3 px-4 py-2.5">
            <a href={`/${lang}`} className="flex min-w-0 items-center gap-2.5 text-ink no-underline">
              <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-[3px] bg-navy text-[0.7rem] font-bold leading-none tracking-wide text-white">
                14566
              </span>
              <span className="truncate text-sm font-semibold leading-tight">{ta("helpline")}</span>
            </a>
            <QuickExit />
          </div>
        </header>
        <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 pb-12 pt-6 text-[1.0625rem] leading-relaxed">{children}</main>
        <footer className="border-t border-line bg-white">
          <div className="mx-auto flex w-full max-w-2xl flex-wrap items-center gap-x-5 gap-y-1 px-4 py-3 text-sm text-ink-2">
            <a className="link" href="tel:112">
              {t("police")} 112
            </a>
            <a className="link" href="tel:14416">
              Tele-MANAS 14416
            </a>
            <a className="link" href="tel:14566">
              {t("nhaa")} 14566
            </a>
          </div>
        </footer>
      </div>
    </NextIntlClientProvider>
  );
}
