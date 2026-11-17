/**
 * Welfare view (task 6.5, FR-DSH-05): rehabilitation, relief, legal-aid and medical
 * referrals, with only the data needed to deliver them.
 */
import { getTranslations } from "next-intl/server";
import { ReferralQueue } from "@/components/staff/referral-queue";
import { roleChannel } from "@/lib/realtime/channels";
import { requirePage } from "@/lib/staff-session";

export default async function Page() {
  const user = await requirePage("welfare");
  const t = await getTranslations("staff.pages");
  const channels = user.districtId ? [roleChannel("WELFARE_OFFICER", user.districtId)] : [];
  return (
    <section className="flex flex-col gap-4">
      <div>
        <h1 className="page-title">{t("welfareTitle")}</h1>
        <p className="text-sm text-ink-3">{t("welfareLead")}</p>
      </div>
      <ReferralQueue channels={channels} canUpdate emptyText={t("welfareEmpty")} />
    </section>
  );
}
