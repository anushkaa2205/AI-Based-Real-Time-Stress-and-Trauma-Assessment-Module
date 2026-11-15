/**
 * One of the three equal ways to share (task F.2, brief §2.2 C): Write, Speak, Guided questions.
 * Each opens the real intake at /portal/<lang> with a non-sensitive ?way= hint.
 */
import Link from "next/link";
import { ListChecks, Mic, PenLine, type LucideIcon } from "lucide-react";
import type { VictimLang } from "@/contracts/victim";
import { portalPath, withWay, type Way } from "@/lib/portal";

const ICONS: Record<Way, LucideIcon> = { write: PenLine, speak: Mic, guided: ListChecks };

export function WayCard({ lang, way, title, body }: { lang: VictimLang; way: Way; title: string; body: string }) {
  const Icon = ICONS[way];
  return (
    <Link
      href={withWay(portalPath(lang), way)}
      data-testid={`way-${way}`}
      className="card flex w-full flex-col gap-2 border-input p-5 text-ink no-underline transition-colors hover:border-navy hover:bg-accent motion-reduce:transition-none"
    >
      <Icon aria-hidden className="size-7 text-navy" strokeWidth={1.75} />
      <span className="text-[1.25rem] font-semibold leading-snug">{title}</span>
      <span className="text-base text-ink-2">{body}</span>
    </Link>
  );
}
