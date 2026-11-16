"use client";

/** Confirmation screen (plan §6.3 step 3): the docket ID is the largest thing on the page. */
import Link from "next/link";
import { Check, Copy, RotateCcw, Search } from "lucide-react";
import { useState } from "react";

export function Registered({ docketNumber, onAnother }: { docketNumber: string; onAnother: () => void }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(docketNumber);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard unavailable: the number is on screen */
    }
  }
  return (
    <section className="card card-raise flex flex-col items-center gap-5 p-7 text-center md:p-10" data-testid="registered">
      <span className="grid size-12 place-items-center rounded-full bg-ok-soft text-ok" aria-hidden>
        <Check className="size-6" />
      </span>
      <div>
        <h2 className="text-2xl font-semibold text-ink">Your case is registered</h2>
        <p className="mt-1 text-ink-2">Keep this docket ID. Helpline staff will see the case on their side.</p>
      </div>
      <p className="num select-all rounded-xl bg-surface-2 px-5 py-4 text-2xl font-medium tracking-wider text-ink sm:text-3xl" data-testid="docket">
        {docketNumber}
      </p>
      <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
        <button type="button" onClick={copy} className="btn btn-secondary">
          {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />} {copied ? "Copied" : "Copy"}
        </button>
        <Link href={`/track/${docketNumber}`} className="btn btn-primary" data-testid="track-this">
          <Search className="size-4" aria-hidden /> Track this case
        </Link>
        <button type="button" onClick={onAnother} className="btn btn-quiet">
          <RotateCcw className="size-4" aria-hidden /> File another
        </button>
      </div>
    </section>
  );
}
