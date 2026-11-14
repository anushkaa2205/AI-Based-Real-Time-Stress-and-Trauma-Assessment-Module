/** Approval inbox for counsellors and supervisors (task 6.1, FR-REC-05, FR-DSH-02). */
import { ApprovalInbox } from "@/components/staff/approval-inbox";
import { requirePage } from "@/lib/staff-session";

export default async function Page() {
  await requirePage("approvals");
  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Approvals</h1>
      <ApprovalInbox caseHref="/counsellor/case" />
    </section>
  );
}
