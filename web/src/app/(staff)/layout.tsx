/**
 * Staff shell (task 1.11, restyled in N.10): dark sidebar with the wordmark, role and icon navigation;
 * live alert banner and real time (tasks 5.1, 5.6). Phase P (task P.8): labels in the site language and
 * the language switcher in the top bar (FR-LANG-07).
 */
import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { LanguageSwitcher } from "@/components/ui/language-switcher";
import { Wordmark } from "@/components/public/wordmark";
import { AlertBanner } from "@/components/staff/alert-banner";
import { RealtimeProvider, type RealtimeConfig } from "@/components/realtime/realtime-provider";
import { access } from "@/core/policies/rbac";
import { env } from "@/lib/env";
import { ONCALL, SUPERVISORS, roleChannel } from "@/lib/realtime/channels";
import { canOpen, navFor, pageKeyOf } from "@/lib/staff-nav";
import { currentStaff } from "@/lib/staff-session";
import { DutyToggle } from "./duty-toggle";
import { SignOutButton } from "./sign-out-button";
import { StaffNavLinks } from "./staff-nav-links";

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const user = await currentStaff();
  if (!user) redirect("/login");
  const t = await getTranslations("staff");
  const roleLabel = t(`roles.${user.role}`);
  const nav = navFor(user.role).map((p) => ({ href: p.href, label: t(`nav.${pageKeyOf(p.href) ?? "counsellor"}`) }));

  const e = env();
  // Only the public key and cluster go to the browser; the secret never leaves the server.
  const realtime: RealtimeConfig =
    e.REALTIME_DRIVER === "pusher" ? { driver: "pusher", key: e.PUSHER_KEY, cluster: e.PUSHER_CLUSTER } : { driver: "sse" };
  const alertChannels = [
    ...(access(user, "alert.read") === "full" ? [ONCALL] : []),
    ...(user.role === "NHAA_SUPERVISOR" ? [SUPERVISORS] : []),
    ...(user.role === "DISTRICT_OFFICER" && user.districtId ? [roleChannel("DISTRICT_OFFICER", user.districtId)] : []),
  ];
  const showAlerts = access(user, "alert.read") !== null;
  const initials = user.name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <RealtimeProvider config={realtime}>
      <div className="flex min-h-full flex-1 flex-col md:flex-row">
        <aside className="panel-night flex flex-col gap-6 px-3 py-4 md:sticky md:top-0 md:h-screen md:w-60 md:shrink-0 md:px-4 md:py-5">
          <div className="flex items-center justify-between gap-3 px-1">
            <Link href="/staff" className="no-underline" aria-label={t("shell.myPortal")}>
              <Wordmark tone="light" />
            </Link>
            <span className="tag border-white/15 bg-white/10 text-white/80 md:hidden">{roleLabel}</span>
          </div>
          <nav aria-label={t("shell.staffNav")} className="md:flex-1">
            <StaffNavLinks items={nav} />
          </nav>
          <div className="flex flex-col gap-3 border-t border-white/10 pt-4">
            {(user.role === "COUNSELLOR" || user.role === "OPERATOR") && <DutyToggle initial={user.isOnDuty} />}
            <div className="flex items-center gap-2.5 px-1">
              <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-full bg-white/10 text-xs font-semibold text-white">
                {initials}
              </span>
              <div className="min-w-0 leading-tight">
                <p className="truncate text-sm font-medium text-white">{user.name}</p>
                <p className="truncate text-xs text-white/60">{roleLabel}</p>
              </div>
            </div>
            <SignOutButton />
          </div>
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center justify-end gap-2 border-b border-line bg-surface px-4 py-2 md:px-8" data-testid="staff-topbar">
            <LanguageSwitcher />
          </div>
          {showAlerts && <AlertBanner channels={alertChannels} caseHref={canOpen(user.role, "counsellor") ? "/counsellor/case" : null} />}
          <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-5 md:px-8 md:py-7">{children}</main>
        </div>
      </div>
    </RealtimeProvider>
  );
}
