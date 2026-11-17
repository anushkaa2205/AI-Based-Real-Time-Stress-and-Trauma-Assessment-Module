/** Approval inbox for counsellors and supervisors (task 6.1, FR-REC-05, FR-DSH-02). */
import { getTranslations } from "next-intl/server";
import { ApprovalInbox } from "@/components/staff/approval-inbox";
import { requirePage } from "@/lib/staff-session";

export default async function Page() {
  await requirePage("approvals");
  const t = await getTranslations("staff.pages");
  return (
    <section className="flex flex-col gap-4">
      <div>
        <h1 className="page-title">{t("approvalsTitle")}</h1>
        <p className="page-lead">{t("approvalsLead")}</p>
      </div>
      <ApprovalInbox caseHref="/counsellor/case" />
    </section>
  );
}
