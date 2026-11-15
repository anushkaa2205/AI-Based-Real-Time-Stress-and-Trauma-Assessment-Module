/**
 * Police liaison view (task 6.4, FR-DSH-04, AC-REC-05): action requests only.
 * What, where, how urgent and the contact route; never narrative, SVI or clinical data.
 */
import { ReferralQueue } from "@/components/staff/referral-queue";
import { roleChannel } from "@/lib/realtime/channels";
import { requirePage } from "@/lib/staff-session";

export default async function Page() {
  const user = await requirePage("police");
  const channels = user.districtId ? [roleChannel("POLICE_LIAISON", user.districtId)] : [];
  return (
    <section className="flex flex-col gap-4">
      <div>
        <h1 className="text-[1.375rem] font-bold leading-tight text-ink">Action requests</h1>
        <p className="text-sm text-muted-foreground">Requests approved by NHAA staff for your district. Contact the complainant only through the route shown.</p>
      </div>
      <ReferralQueue channels={channels} canUpdate emptyText="No action requests for your district." />
    </section>
  );
}
