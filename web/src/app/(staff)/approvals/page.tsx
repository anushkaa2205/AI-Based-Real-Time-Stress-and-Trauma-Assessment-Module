/** Approval inbox for counsellors and supervisors (task 6.1, FR-REC-05, FR-DSH-02). */
import { ApprovalInbox } from "@/components/staff/approval-inbox";
import { requirePage } from "@/lib/staff-session";

export default async function Page() {
  await requirePage("approvals");
  return (
    <section className="flex flex-col gap-4">
      <div>
        <h1 className="page-title">Approvals</h1>
        <p className="page-lead">Proposed support waits here until a person approves or rejects it. Emergency support that was auto-triggered is listed for review.</p>
      </div>
      <ApprovalInbox caseHref="/counsellor/case" />
    </section>
  );
}
