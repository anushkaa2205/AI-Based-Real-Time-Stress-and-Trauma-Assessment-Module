"use client";

/**
 * Language switcher (Phase P, P-D7, FR-LANG-07; plan §6.7). Sits in the public header, on the login
 * page and in the staff top bar. Sets the NEXT_LOCALE cookie and refreshes, so the whole site
 * switches. Each language is named in its own script.
 */
import { Languages } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import type { VictimLang } from "@/contracts/interaction";
import { localeCookie, SITE_LOCALES } from "@/i18n/locale";

export function setSiteLanguage(lang: VictimLang): void {
  document.cookie = localeCookie(lang);
}

export function LanguageSwitcher({ tone = "dark", className = "" }: { tone?: "dark" | "light"; className?: string }) {
  const locale = useLocale();
  const t = useTranslations("public.nav");
  const names = useTranslations("languageNames");
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function change(lang: VictimLang) {
    setSiteLanguage(lang);
    startTransition(() => router.refresh());
  }

  return (
    <label className={`relative items-center ${className || "inline-flex"}`}>
      <span className="sr-only">{t("language")}</span>
      <Languages className={`pointer-events-none absolute left-2.5 size-4 ${tone === "light" ? "text-white/70" : "text-ink-3"}`} aria-hidden />
      <select
        value={locale}
        onChange={(e) => change(e.target.value as VictimLang)}
        disabled={pending}
        aria-label={t("language")}
        className={`min-h-9 cursor-pointer appearance-none rounded-lg border py-1.5 pl-8 pr-3 text-sm font-medium ${
          tone === "light" ? "border-white/20 bg-transparent text-white hover:bg-white/10 [&>option]:text-ink" : "border-line bg-surface text-ink hover:bg-surface-2"
        }`}
        data-testid="language-switcher"
      >
        {SITE_LOCALES.map((l) => (
          <option key={l} value={l} lang={l}>
            {names(l)}
          </option>
        ))}
      </select>
    </label>
  );
}
