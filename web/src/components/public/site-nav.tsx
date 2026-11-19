"use client";

/**
 * Public header (Phase P, P-D6; NIVARA_FLOW_AND_UI_PLAN.md §6.1), on every public page. Left: the
 * wordmark. Middle: How it works, Track a case. Right: NHAA helpline 14566 and Emergency 112 (tap to
 * call), the language switcher, Staff login (or Open my portal), and Quick exit. On small screens the
 * middle links, the helpline number, the switcher and Staff login fold into the menu; Quick exit and
 * Emergency 112 always stay visible. Dark over the home page's hero, light everywhere else.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRight, LogIn, Phone, Siren } from "lucide-react";
import { useTranslations } from "next-intl";
import { LanguageSwitcher } from "@/components/ui/language-switcher";
import { MobileMenu } from "./mobile-menu";
import { QuickExit } from "./quick-exit";
import { Wordmark } from "./wordmark";

export function SiteNav({ signedIn, portalOn }: { signedIn: boolean; portalOn: boolean }) {
  const dark = usePathname() === "/";
  const t = useTranslations("public.nav");
  const h = useTranslations("public.header");
  const links = [{ href: "/#how-it-works", label: t("howItWorks") }, ...(portalOn ? [{ href: "/track", label: t("track") }] : [])];
  const quiet = dark ? "text-white/75 hover:text-white" : "text-ink-2 hover:text-ink";
  const staff = signedIn ? { href: "/staff", label: t("openPortal"), testId: "nav-portal" } : { href: "/login", label: t("staffLogin"), testId: "nav-staff-login" };
  return (
    <header className={`${dark ? "bg-night text-white" : "border-b border-line bg-paper/95 text-ink backdrop-blur"} sticky top-0 z-30`} data-testid="site-header">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-2 px-3 sm:gap-3 sm:px-4 md:px-8">
        <Link href="/" className="shrink-0 no-underline" aria-label={t("home")}>
          <Wordmark tone={dark ? "light" : "dark"} />
        </Link>
        <nav aria-label={t("site")} className="hidden items-center gap-6 xl:flex">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className={`whitespace-nowrap text-sm font-medium no-underline transition-colors ${quiet}`}>
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-1.5 sm:gap-2">
          <a href="tel:14566" aria-label={h("helplineCall")} className={`hidden items-center gap-1.5 whitespace-nowrap text-sm font-medium no-underline xl:inline-flex ${quiet}`} data-testid="call-helpline">
            <Phone className="size-4" aria-hidden /> {h("helpline")}
          </a>
          <a
            href="tel:112"
            aria-label={h("emergency")}
            title={h("emergencyCall")}
            className={`btn btn-sm gap-1.5 whitespace-nowrap ${dark ? "border border-white/25 text-white hover:bg-white/10" : "border border-danger/40 text-danger hover:bg-danger-soft"}`}
            data-testid="call-emergency"
          >
            <Siren className="size-4" aria-hidden /> <span className="hidden sm:inline">{h("emergency")}</span>
            <span className="num sm:hidden">112</span>
          </a>
          <LanguageSwitcher tone={dark ? "light" : "dark"} className="hidden lg:inline-flex" />
          <Link href={staff.href} className={`btn btn-sm hidden whitespace-nowrap lg:inline-flex ${dark ? "btn-ghost-light" : "btn-secondary"}`} data-testid={staff.testId}>
            {signedIn ? (
              <>
                {staff.label} <ArrowRight className="size-4" aria-hidden />
              </>
            ) : (
              <>
                <LogIn className="size-4" aria-hidden /> {staff.label}
              </>
            )}
          </Link>
          <QuickExit tone={dark ? "light" : "dark"} />
          <MobileMenu links={links} dark={dark} staff={staff} helpline={{ label: h("helpline"), aria: h("helplineCall") }} />
        </div>
      </div>
    </header>
  );
}
