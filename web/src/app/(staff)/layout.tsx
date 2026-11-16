/** Staff shell (task 1.11, restyled in N.10): dark sidebar with the wordmark, role and icon navigation; live alert banner and real time (tasks 5.1, 5.6). */
import Link from "next/link";
import { redirect } from "next/navigation";
import { Wordmark } from "@/components/public/wordmark";
import { AlertBanner } from "@/components/staff/alert-banner";
import { RealtimeProvider, type RealtimeConfig } from "@/components/realtime/realtime-provider";
import { access } from "@/core/policies/rbac";
import { env } from "@/lib/env";
import { ONCALL, SUPERVISORS, roleChannel } from "@/lib/realtime/channels";
import { ROLE_LABEL, canOpen, navFor } from "@/lib/staff-nav";
import { currentStaff } from "@/lib/staff-session";
import { DutyToggle } from "./duty-toggle";
import { SignOutButton } from "./sign-out-button";
import { StaffNavLinks } from "./staff-nav-links";

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const user = await currentStaff();
  if (!user) redirect("/login");

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
            <Link href="/staff" className="no-underline" aria-label="My portal">
              <Wordmark tone="light" />
            </Link>
            <span className="tag border-white/15 bg-white/10 text-white/80 md:hidden">{ROLE_LABEL[user.role]}</span>
          </div>
          <nav aria-label="Staff" className="md:flex-1">
            <StaffNavLinks items={navFor(user.role)} />
          </nav>
          <div className="flex flex-col gap-3 border-t border-white/10 pt-4">
            {(user.role === "COUNSELLOR" || user.role === "OPERATOR") && <DutyToggle initial={user.isOnDuty} />}
            <div className="flex items-center gap-2.5 px-1">
              <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-full bg-white/10 text-xs font-semibold text-white">
                {initials}
              </span>
              <div className="min-w-0 leading-tight">
                <p className="truncate text-sm font-medium text-white">{user.name}</p>
                <p className="truncate text-xs text-white/60">{ROLE_LABEL[user.role]}</p>
              </div>
            </div>
            <SignOutButton />
          </div>
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          {showAlerts && <AlertBanner channels={alertChannels} caseHref={canOpen(user.role, "counsellor") ? "/counsellor/case" : null} />}
          <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-5 md:px-8 md:py-7">{children}</main>
        </div>
      </div>
    </RealtimeProvider>
  );
}
