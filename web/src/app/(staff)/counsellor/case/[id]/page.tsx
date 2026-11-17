/** Case detail page (task 5.3). The API checks access to this specific case; the page guard checks the role. */
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { CaseDetailView } from "@/components/staff/case-detail";
import { requirePage } from "@/lib/staff-session";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  await requirePage("counsellor");
  const t = await getTranslations("staff.pages");
  const { id } = await params;
  return (
    <div className="flex flex-col gap-4">
      <Link href="/counsellor" className="link text-sm">
        {t("backToQueue")}
      </Link>
      <CaseDetailView caseId={id} />
    </div>
  );
}
