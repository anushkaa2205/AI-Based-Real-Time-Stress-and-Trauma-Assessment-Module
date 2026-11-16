/** Staff shell: sidebar per role (task 1.11), live alert banner and real time (tasks 5.1, 5.6). */
import { redirect } from "next/navigation";
import { AlertBanner } from "@/components/staff/alert-banner";
import { RealtimeProvider, type RealtimeConfig } from "@/components/realtime/realtime-provider";
import { demoEnabled } from "@/core/demo/client";
import { access } from "@/core/policies/rbac";
import { env } from "@/lib/env";
import { ONCALL, SUPERVISORS, roleChannel } from "@/lib/realtime/channels";
import { ROLE_LABEL, STAFF_PAGES, canOpen, navFor } from "@/lib/staff-nav";
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

  return (
    <RealtimeProvider config={realtime}>
      <div className="flex min-h-full flex-1 flex-col md:flex-row">
        <aside className="flex flex-col gap-5 bg-navy-deep px-3 py-4 text-white md:sticky md:top-0 md:h-screen md:w-56 md:shrink-0">
          <div className="flex items-center gap-2.5 px-1">
            <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-[3px] bg-white text-[0.68rem] font-bold text-navy-deep">
              14566
            </span>
            <div className="min-w-0 leading-tight">
              <p className="text-sm font-bold">NHAA Assist</p>
              <p className="truncate text-xs text-white/70">{ROLE_LABEL[user.role]}</p>
            </div>
          </div>
          <nav aria-label="Staff">
            <StaffNavLinks items={navFor(user.role).filter((p) => p.href !== STAFF_PAGES.demo.href || demoEnabled())} />
          </nav>
          <div className="flex flex-col gap-3 border-t border-white/15 pt-3 md:mt-auto">
            {(user.role === "COUNSELLOR" || user.role === "OPERATOR") && <DutyToggle initial={user.isOnDuty} />}
            <p className="truncate px-1 text-xs text-white/70">{user.name}</p>
            <SignOutButton />
          </div>
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          {showAlerts && <AlertBanner channels={alertChannels} caseHref={canOpen(user.role, "counsellor") ? "/counsellor/case" : null} />}
          <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-5 md:px-7 md:py-6">{children}</main>
        </div>
      </div>
    </RealtimeProvider>
  );
}
