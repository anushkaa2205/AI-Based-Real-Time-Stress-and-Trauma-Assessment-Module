/** Operator assist console (task 7.5, FR-CH-04, FR-DSH-01). */
import { OperatorConsole } from "@/components/staff/operator-console";
import { QUEUE_NATIONAL } from "@/lib/realtime/channels";
import { requirePage } from "@/lib/staff-session";

export default async function Page() {
  const user = await requirePage("operator");
  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-[1.375rem] font-bold leading-tight text-ink">Operator console</h1>
      <OperatorConsole me={user.id} queueChannels={[QUEUE_NATIONAL]} />
    </section>
  );
}
