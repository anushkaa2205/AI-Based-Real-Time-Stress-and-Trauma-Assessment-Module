/** Demo input 1, type a message (plan §6.3). Public; off (404) unless DEMO_ENABLED. */
import { notFound } from "next/navigation";
import { LiveTextDemo } from "@/components/demo/live-text-demo";
import { demoEnabled } from "@/core/demo/client";
import { listDistricts } from "@/core/demo/districts";

export const metadata = { title: "Type a message" };
export const dynamic = "force-dynamic";

export default async function Page() {
  if (!demoEnabled()) notFound();
  return <LiveTextDemo districts={await listDistricts()} />;
}
