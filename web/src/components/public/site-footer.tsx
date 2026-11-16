import Link from "next/link";
import { Wordmark } from "./wordmark";

/** Public footer (plan §6.2 item 6). */
export function SiteFooter() {
  return (
    <footer className="border-t border-line bg-surface-2">
      <div className="mx-auto grid w-full max-w-6xl gap-8 px-5 py-10 md:grid-cols-[1.4fr_1fr_1fr] md:px-8">
        <div className="flex flex-col gap-3">
          <Wordmark />
          <p className="max-w-sm text-sm text-ink-2">
            A real-time stress and trauma assessment module for the National Helpline Against Atrocities (14566). Smart India Hackathon 2026, problem statement SIH26093,
            Ministry of Social Justice and Empowerment.
          </p>
        </div>
        <div className="text-sm">
          <p className="section-title mb-2">Demonstration</p>
          <p className="text-ink-2">This site is a demonstration with synthetic data only. Do not enter real names, numbers or addresses.</p>
        </div>
        <div className="text-sm">
          <p className="section-title mb-2">If you need help</p>
          <p className="text-ink-2">
            Call the National Helpline Against Atrocities at <span className="num font-medium text-ink">14566</span>, or emergency services at <span className="num font-medium text-ink">112</span>.
          </p>
          <p className="mt-3">
            <Link href="/login" className="link">
              Staff login
            </Link>
          </p>
        </div>
      </div>
    </footer>
  );
}
