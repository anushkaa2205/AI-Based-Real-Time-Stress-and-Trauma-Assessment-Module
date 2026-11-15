/** Audit log for the auditor (task 8.6, FR-AUD-03). */
import { AuditViewer } from "@/components/staff/audit-viewer";
import { requirePage } from "@/lib/staff-session";

export default async function Page() {
  await requirePage("audit");
  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-[1.375rem] font-bold leading-tight text-ink">Audit log</h1>
      <p className="text-sm text-muted-foreground">Every view, change and export, chained by hash so that any edit or deletion shows up.</p>
      <AuditViewer />
    </section>
  );
}
