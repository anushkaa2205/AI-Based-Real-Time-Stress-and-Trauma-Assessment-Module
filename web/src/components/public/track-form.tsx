"use client";

/** Docket ID field (plan §6.2 item 4, §6.4): opens /track/<docket>. */
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { useState, type FormEvent } from "react";
import { DOCKET_PATTERN } from "@/core/cases/docket";

export function TrackForm({ initial = "", autoFocus = false }: { initial?: string; autoFocus?: boolean }) {
  const router = useRouter();
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<string | null>(null);

  function submit(e: FormEvent) {
    e.preventDefault();
    const docket = value.trim().toUpperCase();
    if (!DOCKET_PATTERN.test(docket)) return setError("A docket ID looks like NHAA-2026-MH-004512.");
    setError(null);
    router.push(`/track/${docket}`);
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2" data-testid="track-form">
      <label htmlFor="docket" className="label">
        Docket ID
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          id="docket"
          name="docket"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="NHAA-2026-MH-004512"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          autoFocus={autoFocus}
          className="field num min-h-11 flex-1 uppercase tracking-wide"
          aria-invalid={!!error}
          aria-describedby={error ? "docket-error" : undefined}
        />
        <button type="submit" className="btn btn-primary min-h-11">
          <Search className="size-4" aria-hidden /> Track
        </button>
      </div>
      {error && (
        <p id="docket-error" role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </form>
  );
}
