/**
 * District dashboard (task 6.6, FR-DSH-03): High and Critical cases in the district
 * (band and SVI only), police and protection proposals awaiting the officer, missed
 * deadlines and all open referrals. Escalated alerts appear in the banner above.
 */
import { ApprovalInbox } from "@/components/staff/approval-inbox";
import { DistrictCases } from "@/components/staff/district-cases";
import { ReferralQueue } from "@/components/staff/referral-queue";
import { queueChannel, roleChannel } from "@/lib/realtime/channels";
import { requirePage } from "@/lib/staff-session";

export default async function Page() {
  const user = await requirePage("district");
  const d = user.districtId;
  if (!d) return <p className="empty">Your account has no district. Ask an administrator to set one.</p>;
  const referralChannels = [roleChannel("DISTRICT_OFFICER", d)];
  return (
    <section className="flex flex-col gap-8">
      <div>
        <h1 className="page-title">District dashboard</h1>
        <p className="page-lead">High and Critical cases in your district, the police and protection proposals waiting for you, and every open referral.</p>
      </div>
      <section className="flex flex-col gap-2">
        <h2 className="section-title">High and Critical cases</h2>
        <DistrictCases channels={[queueChannel(d)]} />
      </section>
      <section className="flex flex-col gap-2">
        <h2 className="section-title">Police and protection requests awaiting you</h2>
        <ApprovalInbox caseHref={null} showReviews={false} />
      </section>
      <ReferralQueue title="Missed deadlines" channels={referralChannels} query="?overdue=true" canUpdate emptyText="No overdue referrals." />
      <ReferralQueue title="Open referrals" channels={referralChannels} query="?status=PENDING,ACCEPTED,IN_PROGRESS" canUpdate emptyText="No open referrals." />
    </section>
  );
}
