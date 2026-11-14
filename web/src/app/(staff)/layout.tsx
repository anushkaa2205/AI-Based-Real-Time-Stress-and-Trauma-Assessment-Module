/** Staff shell: sidebar per role (task 1.11), live alert banner and real time (tasks 5.1, 5.6). */
import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertBanner } from "@/components/staff/alert-banner";
import { RealtimeProvider, type RealtimeConfig } from "@/components/realtime/realtime-provider";
import { access } from "@/core/policies/rbac";
import { env } from "@/lib/env";
import { ONCALL, SUPERVISORS, roleChannel } from "@/lib/realtime/channels";
import { ROLE_LABEL, canOpen, navFor } from "@/lib/staff-nav";
import { currentStaff } from "@/lib/staff-session";
import { DutyToggle } from "./duty-toggle";
import { SignOutButton } from "./sign-out-button";

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
        <aside className="flex flex-col gap-4 border-b border-border p-4 md:w-60 md:border-b-0 md:border-r">
          <div>
            <p className="font-semibold">NHAA Assist</p>
            <p className="text-sm text-muted-foreground">
              {user.name} · {ROLE_LABEL[user.role]}
            </p>
          </div>
          <nav aria-label="Staff">
            <ul className="flex flex-col gap-1">
              {navFor(user.role).map((p) => (
                <li key={p.href}>
                  <Link href={p.href} className="block rounded-md px-2 py-1.5 text-sm hover:bg-muted">
                    {p.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          {(user.role === "COUNSELLOR" || user.role === "OPERATOR") && <DutyToggle initial={user.isOnDuty} />}
          <div className="md:mt-auto">
            <SignOutButton />
          </div>
        </aside>
        <div className="flex flex-1 flex-col">
          {showAlerts && <AlertBanner channels={alertChannels} caseHref={canOpen(user.role, "counsellor") ? "/counsellor/case" : null} />}
          <main className="flex-1 p-6">{children}</main>
        </div>
      </div>
    </RealtimeProvider>
  );
}
