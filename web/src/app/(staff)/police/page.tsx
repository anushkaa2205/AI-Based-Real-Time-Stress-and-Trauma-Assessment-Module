/**
 * Police liaison view (task 6.4, FR-DSH-04, AC-REC-05): action requests only.
 * What, where, how urgent and the contact route; never narrative, SVI or clinical data.
 */
import { getTranslations } from "next-intl/server";
import { ReferralQueue } from "@/components/staff/referral-queue";
import { roleChannel } from "@/lib/realtime/channels";
import { requirePage } from "@/lib/staff-session";

export default async function Page() {
  const user = await requirePage("police");
  const t = await getTranslations("staff.pages");
  const channels = user.districtId ? [roleChannel("POLICE_LIAISON", user.districtId)] : [];
  return (
    <section className="flex flex-col gap-4">
      <div>
        <h1 className="page-title">{t("policeTitle")}</h1>
        <p className="text-sm text-ink-3">{t("policeLead")}</p>
      </div>
      <ReferralQueue channels={channels} canUpdate emptyText={t("policeEmpty")} />
    </section>
  );
}
