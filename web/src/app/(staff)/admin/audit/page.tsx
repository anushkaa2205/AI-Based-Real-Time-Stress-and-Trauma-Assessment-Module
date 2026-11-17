/** Audit log for the auditor (task 8.6, FR-AUD-03). */
import { getTranslations } from "next-intl/server";
import { AuditViewer } from "@/components/staff/audit-viewer";
import { requirePage } from "@/lib/staff-session";

export default async function Page() {
  await requirePage("audit");
  const t = await getTranslations("staff.pages");
  return (
    <section className="flex flex-col gap-4">
      <h1 className="page-title">{t("auditTitle")}</h1>
      <p className="text-sm text-ink-3">{t("auditLead")}</p>
      <AuditViewer />
    </section>
  );
}
