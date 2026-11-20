"use client";

/**
 * Language switcher (Phase P, P-D7, FR-LANG-07; plan §6.7). Sits in the public header, the mobile
 * menu, the login page and the staff top bar. Sets the NEXT_LOCALE cookie and refreshes, so the
 * whole site switches. Each language is named in its own script.
 *
 * A Base UI Select rather than a native <select>: the browser draws a native option list in the
 * OS style (white box, blue highlight), which breaks the Nivara theme. This keeps the same keyboard
 * and screen-reader behaviour (listbox, arrows, type-ahead, Escape) and is styled per tone:
 * "light" sits on the dark petrol header, "dark" on paper and the staff top bar. Marigold is used
 * only in the "light" tone, so it never appears on staff screens (globals.css).
 */
import { Select } from "@base-ui/react/select";
import { Check, ChevronDown, Languages } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import type { VictimLang } from "@/contracts/interaction";
import { localeCookie, SITE_LOCALES } from "@/i18n/locale";

export function setSiteLanguage(lang: VictimLang): void {
  document.cookie = localeCookie(lang);
}

export function LanguageSwitcher({
  tone = "dark",
  align = "end",
  className = "",
}: {
  tone?: "dark" | "light";
  align?: "start" | "end";
  className?: string;
}) {
  const locale = useLocale() as VictimLang;
  const t = useTranslations("public.nav");
  const names = useTranslations("languageNames");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const onDark = tone === "light";

  const items = Object.fromEntries(SITE_LOCALES.map((l) => [l, names(l)])) as Record<VictimLang, string>;

  function change(lang: VictimLang | null) {
    if (!lang || lang === locale) return;
    setSiteLanguage(lang);
    startTransition(() => router.refresh());
  }

  const trigger = onDark
    ? "border-white/25 text-white hover:border-white/45 hover:bg-white/[0.08] data-[popup-open]:border-white/45 data-[popup-open]:bg-white/[0.08]"
    : "border-line bg-surface text-ink hover:bg-surface-2 data-[popup-open]:bg-surface-2";

  const popup = onDark
    ? "border-white/10 bg-night-2 text-white/80 shadow-[0_18px_40px_-12px_rgb(0_0_0/0.6)]"
    : "border-line bg-surface text-ink-2 shadow-raise";

  const item = onDark
    ? "data-[highlighted]:bg-white/[0.07] data-[highlighted]:text-white data-[selected]:text-white"
    : "data-[highlighted]:bg-surface-2 data-[highlighted]:text-ink data-[selected]:text-brand-deep";

  return (
    <div className={`${className || "inline-flex"} items-center`}>
      <Select.Root<VictimLang> value={locale} onValueChange={change} items={items} disabled={pending} modal={false}>
        <Select.Trigger
          aria-label={t("language")}
          className={`inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-1.5 text-sm font-medium transition-colors outline-none disabled:cursor-progress disabled:opacity-70 ${trigger}`}
          data-testid="language-switcher"
        >
          <Languages className={`size-4 shrink-0 ${onDark ? "text-white/70" : "text-ink-3"}`} aria-hidden />
          <Select.Value className="whitespace-nowrap" />
          <Select.Icon className={`flex transition-transform duration-150 data-[popup-open]:rotate-180 ${onDark ? "text-white/60" : "text-ink-3"}`}>
            <ChevronDown className="size-3.5" aria-hidden />
          </Select.Icon>
        </Select.Trigger>
        <Select.Portal>
          <Select.Positioner side="bottom" align={align} sideOffset={8} alignItemWithTrigger={false} className="z-[60] outline-none">
            <Select.Popup
              className={`min-w-[max(var(--anchor-width),11.5rem)] origin-[var(--transform-origin)] rounded-xl border p-1.5 outline-none transition-[opacity,transform] duration-150 data-[ending-style]:scale-[0.98] data-[ending-style]:opacity-0 data-[starting-style]:scale-[0.98] data-[starting-style]:opacity-0 ${popup}`}
              data-testid="language-menu"
            >
              <p className={`px-2.5 pb-1.5 pt-1 text-[0.6875rem] font-medium uppercase tracking-[0.08em] ${onDark ? "text-white/45" : "text-ink-3"}`} aria-hidden>
                {t("language")}
              </p>
              <Select.List className="flex flex-col gap-0.5">
                {SITE_LOCALES.map((l) => (
                  <Select.Item
                    key={l}
                    value={l}
                    className={`grid cursor-pointer grid-cols-[1rem_1fr_auto] items-center gap-2.5 rounded-lg px-2.5 py-2 text-[0.9375rem] outline-none select-none transition-colors data-[selected]:font-medium ${item}`}
                    data-testid={`language-option-${l}`}
                  >
                    <Select.ItemIndicator className="col-start-1 flex">
                      <Check className={`size-4 ${onDark ? "text-marigold" : "text-brand"}`} aria-hidden />
                    </Select.ItemIndicator>
                    <Select.ItemText lang={l} className="col-start-2">
                      {names(l)}
                    </Select.ItemText>
                    <span className={`num col-start-3 text-[0.6875rem] uppercase tracking-wider ${onDark ? "text-white/35" : "text-ink-3"}`} aria-hidden>
                      {l}
                    </span>
                  </Select.Item>
                ))}
              </Select.List>
            </Select.Popup>
          </Select.Positioner>
        </Select.Portal>
      </Select.Root>
    </div>
  );
}
