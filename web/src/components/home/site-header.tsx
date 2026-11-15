/**
 * Header of the public pages (task F.2, brief §2.2 A and §2.3): a plain text identity (no official
 * emblem), Quick exit, How it works, Privacy, a quiet Staff sign-in link and the language selector.
 * On phones the three page links sit behind a native <details> "Menu" so the header stays short and
 * Start stays near the top; the language links are always visible. No staff form, no status, no data.
 */
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Menu } from "lucide-react";
import type { VictimLang } from "@/contracts/victim";
import { QuickExit } from "@/components/victim/quick-exit";
import { publicPath } from "@/lib/portal";
import { LanguageLinks } from "./language-links";

export type PublicRoute = "/" | "/how-it-works" | "/privacy";

const navLink = "inline-flex min-h-11 items-center text-ink underline decoration-input underline-offset-4 hover:text-navy";

function SiteNav({ lang, path, t }: { lang: VictimLang; path: PublicRoute; t: (key: "label" | "howItWorks" | "privacy" | "staff") => string }) {
  return (
    <nav aria-label={t("label")}>
      <ul className="flex flex-col gap-x-5 sm:flex-row sm:flex-wrap sm:items-center">
        <li>
          <Link href={publicPath(lang, "/how-it-works")} aria-current={path === "/how-it-works" ? "page" : undefined} className={navLink}>
            {t("howItWorks")}
          </Link>
        </li>
        <li>
          <Link href={publicPath(lang, "/privacy")} aria-current={path === "/privacy" ? "page" : undefined} className={navLink}>
            {t("privacy")}
          </Link>
        </li>
        <li>
          {/* A plain link (no prefetch): staff pages stay separate from the victim entry. */}
          <a href="/login" className="inline-flex min-h-11 items-center text-sm text-ink-2 underline decoration-input underline-offset-4">
            {t("staff")}
          </a>
        </li>
      </ul>
    </nav>
  );
}

export async function SiteHeader({ lang, path }: { lang: VictimLang; path: PublicRoute }) {
  const t = await getTranslations({ locale: lang, namespace: "home.nav" });
  const ta = await getTranslations({ locale: lang, namespace: "app" });

  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-2 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <Link href={publicPath(lang)} className="flex min-w-0 items-center gap-2.5 text-ink no-underline" data-testid="wordmark">
            <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-[6px] bg-navy text-[0.72rem] font-bold text-white">
              14566
            </span>
            <span className="flex min-w-0 flex-col leading-tight">
              <span className="font-semibold">{ta("name")}</span>
              <span className="hidden text-sm text-ink-2 sm:block">{ta("helpline")}</span>
            </span>
          </Link>
          <QuickExit />
        </div>
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-1 sm:items-center">
          <details className="group sm:hidden" data-testid="site-menu">
            <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-2 font-medium text-ink [&::-webkit-details-marker]:hidden">
              <Menu aria-hidden className="size-5" strokeWidth={1.75} />
              {t("menu")}
            </summary>
            <div className="pb-1 pl-7">
              <SiteNav lang={lang} path={path} t={t} />
            </div>
          </details>
          <div className="hidden sm:block">
            <SiteNav lang={lang} path={path} t={t} />
          </div>
          <LanguageLinks lang={lang} path={path} label={t("language")} />
        </div>
      </div>
    </header>
  );
}
