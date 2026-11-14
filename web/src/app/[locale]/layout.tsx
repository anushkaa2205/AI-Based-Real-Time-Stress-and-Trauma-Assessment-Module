/** Victim screens (task 3.7): language from the URL, all text from messages/*.json. */
import { NextIntlClientProvider } from "next-intl";
import { setRequestLocale } from "next-intl/server";
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
  return (
    <NextIntlClientProvider locale={lang} messages={MESSAGES[lang]} timeZone="Asia/Kolkata">
      <div lang={lang} className="flex min-h-full flex-1 flex-col bg-background text-foreground">
        <QuickExit />
        <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 px-4 pb-10 pt-4 text-lg leading-relaxed">
          {children}
        </main>
      </div>
    </NextIntlClientProvider>
  );
}
