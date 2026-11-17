/**
 * District dashboard (task 6.6, FR-DSH-03): High and Critical cases in the district
 * (band and SVI only), police and protection proposals awaiting the officer, missed
 * deadlines and all open referrals. Escalated alerts appear in the banner above.
 */
import { getTranslations } from "next-intl/server";
import { ApprovalInbox } from "@/components/staff/approval-inbox";
import { DistrictCases } from "@/components/staff/district-cases";
import { ReferralQueue } from "@/components/staff/referral-queue";
import { queueChannel, roleChannel } from "@/lib/realtime/channels";
import { requirePage } from "@/lib/staff-session";

export default async function Page() {
  const user = await requirePage("district");
  const t = await getTranslations("staff.pages");
  const d = user.districtId;
  if (!d) return <p className="empty">{t("noDistrict")}</p>;
  const referralChannels = [roleChannel("DISTRICT_OFFICER", d)];
  return (
    <section className="flex flex-col gap-8">
      <div>
        <h1 className="page-title">{t("districtTitle")}</h1>
        <p className="page-lead">{t("districtLead")}</p>
      </div>
      <section className="flex flex-col gap-2">
        <h2 className="section-title">{t("districtCases")}</h2>
        <DistrictCases channels={[queueChannel(d)]} />
      </section>
      <section className="flex flex-col gap-2">
        <h2 className="section-title">{t("districtRequests")}</h2>
        <ApprovalInbox caseHref={null} showReviews={false} />
      </section>
      <ReferralQueue title={t("missed")} channels={referralChannels} query="?overdue=true" canUpdate emptyText={t("missedEmpty")} />
      <ReferralQueue title={t("openReferrals")} channels={referralChannels} query="?status=PENDING,ACCEPTED,IN_PROGRESS" canUpdate emptyText={t("openReferralsEmpty")} />
    </section>
  );
}
