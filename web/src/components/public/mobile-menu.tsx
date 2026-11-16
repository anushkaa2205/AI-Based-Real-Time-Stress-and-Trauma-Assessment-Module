"use client";

/** Small-screen menu for the public navbar: the middle links fold in here; Staff login stays outside. */
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { useState } from "react";

export function MobileMenu({ links, dark }: { links: { href: string; label: string }[]; dark: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="md:hidden">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="mobile-menu"
        aria-label={open ? "Close menu" : "Open menu"}
        onClick={() => setOpen((o) => !o)}
        className={`btn btn-sm ${dark ? "btn-ghost-light" : "btn-secondary"} px-2`}
      >
        {open ? <X className="size-4" aria-hidden /> : <Menu className="size-4" aria-hidden />}
      </button>
      {open && (
        <div id="mobile-menu" className={`absolute inset-x-0 top-16 border-b px-5 py-3 ${dark ? "border-white/10 bg-night" : "border-line bg-paper"}`}>
          <nav aria-label="Site" className="flex flex-col">
            {links.map((l) => (
              <Link key={l.href} href={l.href} onClick={() => setOpen(false)} className={`py-2.5 text-base font-medium no-underline ${dark ? "text-white/85" : "text-ink"}`}>
                {l.label}
              </Link>
            ))}
          </nav>
        </div>
      )}
    </div>
  );
}
