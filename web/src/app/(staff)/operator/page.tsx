/** Operator assist console (task 7.5, FR-CH-04, FR-DSH-01). */
import { getTranslations } from "next-intl/server";
import { OperatorConsole } from "@/components/staff/operator-console";
import { QUEUE_NATIONAL } from "@/lib/realtime/channels";
import { requirePage } from "@/lib/staff-session";

export default async function Page() {
  const user = await requirePage("operator");
  const t = await getTranslations("staff.pages");
  return (
    <section className="flex flex-col gap-4">
      <h1 className="page-title">{t("operatorTitle")}</h1>
      <OperatorConsole me={user.id} queueChannels={[QUEUE_NATIONAL]} />
    </section>
  );
}
