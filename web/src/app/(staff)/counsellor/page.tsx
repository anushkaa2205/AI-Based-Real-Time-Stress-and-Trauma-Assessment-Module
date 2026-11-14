/** Counsellor and supervisor home: the live risk-sorted queue (task 5.2). */
import { CaseQueue } from "@/components/staff/case-queue";
import { listScope } from "@/core/policies/rbac";
import { QUEUE_NATIONAL, queueChannel } from "@/lib/realtime/channels";
import { requirePage } from "@/lib/staff-session";

export default async function Page() {
  const user = await requirePage("counsellor");
  const scope = listScope(user, "case.list");
  const channels = scope?.kind === "district" ? [queueChannel(scope.districtId)] : [QUEUE_NATIONAL];
  return <CaseQueue channels={channels} caseHref="/counsellor/case" />;
}
