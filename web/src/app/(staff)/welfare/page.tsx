/**
 * Welfare view (task 6.5, FR-DSH-05): rehabilitation, relief, legal-aid and medical
 * referrals, with only the data needed to deliver them.
 */
import { ReferralQueue } from "@/components/staff/referral-queue";
import { roleChannel } from "@/lib/realtime/channels";
import { requirePage } from "@/lib/staff-session";

export default async function Page() {
  const user = await requirePage("welfare");
  const channels = user.districtId ? [roleChannel("WELFARE_OFFICER", user.districtId)] : [];
  return (
    <section className="flex flex-col gap-4">
      <div>
        <h1 className="text-[1.375rem] font-bold leading-tight text-ink">Referrals</h1>
        <p className="text-sm text-muted-foreground">Relief, rehabilitation, legal aid and medical support approved for your district.</p>
      </div>
      <ReferralQueue channels={channels} canUpdate emptyText="No referrals for your district." />
    </section>
  );
}
