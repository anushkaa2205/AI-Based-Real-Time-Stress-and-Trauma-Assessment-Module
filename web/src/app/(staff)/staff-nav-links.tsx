"use client";

/** Sidebar links; marks the current page (aria-current) so staff always know where they are. */
import Link from "next/link";
import { usePathname } from "next/navigation";

export function StaffNavLinks({ items }: { items: readonly { href: string; label: string }[] }) {
  const path = usePathname();
  return (
    <ul className="flex flex-row flex-wrap gap-0.5 md:flex-col">
      {items.map((p) => {
        const active = path === p.href || path.startsWith(`${p.href}/`);
        return (
          <li key={p.href}>
            <Link
              href={p.href}
              aria-current={active ? "page" : undefined}
              className={`block border-l-[3px] px-3 py-1.5 text-sm no-underline ${
                active ? "border-amber-400 bg-white/10 font-semibold text-white" : "border-transparent text-white/80 hover:bg-white/5 hover:text-white"
              }`}
            >
              {p.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
