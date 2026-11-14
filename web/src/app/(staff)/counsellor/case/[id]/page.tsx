/** Case detail page (task 5.3). The API checks access to this specific case; the page guard checks the role. */
import Link from "next/link";
import { CaseDetailView } from "@/components/staff/case-detail";
import { requirePage } from "@/lib/staff-session";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  await requirePage("counsellor");
  const { id } = await params;
  return (
    <div className="flex flex-col gap-4">
      <Link href="/counsellor" className="text-sm underline underline-offset-4">
        ← Back to queue
      </Link>
      <CaseDetailView caseId={id} />
    </div>
  );
}
