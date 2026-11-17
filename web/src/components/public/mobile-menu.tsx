"use client";

/**
 * Small-screen menu for the public header (plan §6.1): the middle links, the helpline number, the
 * language switcher and Staff login fold in here. Quick exit and Emergency 112 stay outside.
 */
import Link from "next/link";
import { Menu, Phone, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { LanguageSwitcher } from "@/components/ui/language-switcher";

export function MobileMenu({
  links,
  dark,
  staff,
  helpline,
}: {
  links: { href: string; label: string }[];
  dark: boolean;
  staff: { href: string; label: string; testId: string };
  helpline: { label: string; aria: string };
}) {
  const [open, setOpen] = useState(false);
  const t = useTranslations("public.nav");
  const item = `py-2.5 text-base font-medium no-underline ${dark ? "text-white/85" : "text-ink"}`;
  return (
    <div className="xl:hidden">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="mobile-menu"
        aria-label={open ? t("menuClose") : t("menuOpen")}
        onClick={() => setOpen((o) => !o)}
        className={`btn btn-sm ${dark ? "btn-ghost-light" : "btn-secondary"} px-2`}
        data-testid="menu-toggle"
      >
        {open ? <X className="size-4" aria-hidden /> : <Menu className="size-4" aria-hidden />}
      </button>
      {open && (
        <div id="mobile-menu" className={`absolute inset-x-0 top-16 border-b px-5 py-3 ${dark ? "border-white/10 bg-night" : "border-line bg-paper"}`}>
          <nav aria-label={t("site")} className="flex flex-col">
            {links.map((l) => (
              <Link key={l.href} href={l.href} onClick={() => setOpen(false)} className={item}>
                {l.label}
              </Link>
            ))}
            <a href="tel:14566" aria-label={helpline.aria} className={`${item} inline-flex items-center gap-2`}>
              <Phone className="size-4" aria-hidden /> {helpline.label}
            </a>
            <Link href={staff.href} onClick={() => setOpen(false)} className={item} data-testid={`${staff.testId}-menu`}>
              {staff.label}
            </Link>
          </nav>
          <LanguageSwitcher tone={dark ? "light" : "dark"} className="mt-2 inline-flex" />
        </div>
      )}
    </div>
  );
}
