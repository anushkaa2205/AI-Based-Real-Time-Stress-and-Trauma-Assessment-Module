"use client";

/** Sidebar links with icons; marks the current page (aria-current) so staff always know where they are. */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, ClipboardCheck, FileSearch, Headset, Inbox, LayoutGrid, Map, Settings, Shield, type LucideIcon } from "lucide-react";

const ICON: Record<string, LucideIcon> = {
  "/operator": Headset,
  "/counsellor": Inbox,
  "/approvals": ClipboardCheck,
  "/district": Map,
  "/police": Shield,
  "/welfare": LayoutGrid,
  "/analytics": BarChart3,
  "/admin": Settings,
  "/admin/audit": FileSearch,
};

export function StaffNavLinks({ items }: { items: readonly { href: string; label: string }[] }) {
  const path = usePathname();
  return (
    <ul className="flex flex-row flex-wrap gap-1 md:flex-col">
      {items.map((p) => {
        const active = p.href === "/admin" ? path === "/admin" : path === p.href || path.startsWith(`${p.href}/`);
        const Icon = ICON[p.href] ?? LayoutGrid;
        return (
          <li key={p.href}>
            <Link
              href={p.href}
              aria-current={active ? "page" : undefined}
              className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm no-underline transition-colors ${
                active ? "bg-white/12 font-semibold text-white" : "text-white/70 hover:bg-white/6 hover:text-white"
              }`}
            >
              <Icon className={`size-4 shrink-0 ${active ? "text-white" : ""}`} aria-hidden />
              {p.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
