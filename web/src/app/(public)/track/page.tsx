/** Track a case (plan §6.4): the docket ID field. Public; off (404) unless DEMO_ENABLED. */
import { notFound } from "next/navigation";
import { TrackForm } from "@/components/public/track-form";
import { demoEnabled } from "@/core/demo/client";
import { MESSAGES } from "@/core/i18n/messages";

export const metadata = { title: "Track a case" };

export default function Page() {
  if (!demoEnabled()) notFound();
  const t = MESSAGES.en.track;
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 px-5 py-10 md:py-16">
      <div>
        <p className="eyebrow">Track a case</p>
        <h1 className="page-title mt-2">{t.title}</h1>
        <p className="page-lead">{t.lead}</p>
      </div>
      <div className="card card-pad">
        <TrackForm autoFocus />
      </div>
    </main>
  );
}
