"use client";

/**
 * Public navbar (NIVARA_FLOW_AND_UI_PLAN.md §6.1). The layout tells it whether a staff member is
 * signed in (then "Open my portal" replaces "Staff login") and whether the demo is on. Dark over
 * the home page's hero, light everywhere else.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRight, LogIn } from "lucide-react";
import { useTranslations } from "next-intl";
import { LanguageSwitcher } from "@/components/ui/language-switcher";
import { MobileMenu } from "./mobile-menu";
import { Wordmark } from "./wordmark";

export function SiteNav({ signedIn, demoOn }: { signedIn: boolean; demoOn: boolean }) {
  const dark = usePathname() === "/";
  const t = useTranslations("public.nav");
  const links = [
    { href: "/#how-it-works", label: t("howItWorks") },
    ...(demoOn ? [{ href: "/track", label: t("track") }] : []),
    { href: "/api/docs", label: t("api") },
  ];
  return (
    <header className={`${dark ? "bg-night text-white" : "bg-paper/90 text-ink backdrop-blur"} sticky top-0 z-30 ${dark ? "" : "border-b border-line"}`}>
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-5 md:px-8">
        <Link href="/" className="no-underline" aria-label={t("home")}>
          <Wordmark tone={dark ? "light" : "dark"} />
        </Link>
        <nav aria-label={t("site")} className="hidden items-center gap-7 md:flex">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className={`text-sm font-medium no-underline transition-colors ${dark ? "text-white/75 hover:text-white" : "text-ink-2 hover:text-ink"}`}>
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <LanguageSwitcher tone={dark ? "light" : "dark"} className="hidden sm:inline-flex" />
          {signedIn ? (
            <Link href="/staff" className={`btn btn-sm ${dark ? "btn-ghost-light" : "btn-secondary"}`} data-testid="nav-portal">
              {t("openPortal")} <ArrowRight className="size-4" aria-hidden />
            </Link>
          ) : (
            <Link href="/login" className={`btn btn-sm ${dark ? "btn-ghost-light" : "btn-primary"}`} data-testid="nav-staff-login">
              <LogIn className="size-4" aria-hidden /> {t("staffLogin")}
            </Link>
          )}
          <MobileMenu links={links} dark={dark} />
        </div>
      </div>
    </header>
  );
}
