"use client";

/**
 * Approve / reject / review one recommendation (task 6.1, FR-REC-05/07).
 * The referral text is what police or welfare will read, so the form says so,
 * counts characters, and the server rejects anything over 300 (REFERRAL_TOO_DETAILED).
 */
import { useState, type FormEvent } from "react";

export interface RecLike {
  id: string;
  type: string;
  status: string;
  responsibleRole: string;
  decision?: { by: { name: string }; at: string; reason?: string };
  referralId?: string;
}

const MAX = 300;
/** Same defaults as the server (core/referrals/rules.ts), shown so the approver can edit them. */
const DEFAULT_ACTION: Record<string, string> = {
  COUNSELLING: "Counselling session with the complainant",
  LEGAL_AID: "Legal aid: help registering the complaint and explaining rights",
  MEDICAL_ASSISTANCE: "Arrange a medical examination or treatment",
  POLICE_INTERVENTION: "Protection visit or patrolling near the complainant",
  WITNESS_PROTECTION: "Assess and arrange witness protection",
  EMERGENCY_SUPPORT: "Immediate call back to the complainant",
  REHABILITATION_RELIEF: "Rehabilitation and relief support",
  INFORMATION: "Share information on rights and support services",
};
const lower = (s: string) => s.replace(/_/g, " ").toLowerCase();

async function decide(id: string, body: unknown) {
  const res = await fetch(`/api/v1/staff/recommendations/${id}/decision`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }).catch(() => null);
  const data = (await res?.json().catch(() => ({}))) as { detail?: string; title?: string } | undefined;
  return { ok: !!res?.ok, message: data?.detail ?? data?.title ?? "Could not save the decision" };
}

export function RecommendationActions({ rec, onDone }: { rec: RecLike; onDone: (message: string) => void }) {
  const [mode, setMode] = useState<"approve" | "reject" | null>(null);
  const [action, setAction] = useState(DEFAULT_ACTION[rec.type] ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(body: unknown, success: string) {
    setBusy(true);
    setError(null);
    const r = await decide(rec.id, body);
    setBusy(false);
    if (r.ok) {
      setMode(null);
      onDone(success);
    } else setError(r.message);
  }

  async function approve(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    await run(
      {
        decision: "APPROVE",
        reason: String(f.get("reason") ?? "") || undefined,
        referral: { actionRequested: action, locationHint: String(f.get("locationHint") ?? "") || undefined },
      },
      `Approved: a referral was sent to the ${lower(rec.responsibleRole)} queue.`,
    );
  }

  async function reject(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    await run({ decision: "REJECT", reason: String(f.get("reason") ?? "") }, "Recommendation rejected.");
  }

  if (rec.status === "AUTO_TRIGGERED" && rec.type === "EMERGENCY_SUPPORT") {
    if (rec.decision) return <span className="text-xs text-muted-foreground">Reviewed by {rec.decision.by.name}</span>;
    return (
      <span className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-danger">Started automatically: needs your review</span>
        <button type="button" disabled={busy} className="btn btn-secondary btn-sm" onClick={() => run({ decision: "POST_REVIEW" }, "Emergency support reviewed.")}>
          Mark reviewed
        </button>
        {error && <span className="text-xs text-danger">{error}</span>}
      </span>
    );
  }
  if (rec.status !== "PROPOSED") {
    return rec.decision ? (
      <span className="text-xs text-muted-foreground">
        {lower(rec.status)} by {rec.decision.by.name}
        {rec.referralId ? " · referral sent" : ""}
      </span>
    ) : null;
  }

  return (
    <div className="flex flex-col gap-2" data-testid={`rec-actions-${rec.type}`}>
      {mode === null && (
        <span className="flex gap-2">
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setMode("approve")}>
            Approve
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setMode("reject")}>
            Reject
          </button>
        </span>
      )}
      {mode === "approve" && (
        <form onSubmit={approve} className="card flex flex-col gap-1 p-2 text-xs">
          <label htmlFor={`act-${rec.id}`} className="font-semibold">
            What should the {lower(rec.responsibleRole)} do?
          </label>
          <p role="note" className="text-warn">
            This text goes to an outside agency. Write the action only: no story, no health details, no scores.
          </p>
          <textarea id={`act-${rec.id}`} name="actionRequested" value={action} onChange={(e) => setAction(e.target.value)} rows={2} className="field" />
          <span className={action.length > MAX ? "text-danger" : "text-muted-foreground"}>
            {action.length}/{MAX} characters
          </span>
          <input name="locationHint" placeholder="Village or ward (never a full address)" maxLength={MAX} className="field" />
          <input name="reason" placeholder="Note for the record (optional)" className="field" />
          <span className="flex gap-2">
            <button type="submit" disabled={busy} className="btn btn-primary btn-sm">
              Approve and send referral
            </button>
            <button type="button" className="link" onClick={() => setMode(null)}>
              Cancel
            </button>
          </span>
        </form>
      )}
      {mode === "reject" && (
        <form onSubmit={reject} className="card flex flex-col gap-1 p-2 text-xs">
          <input name="reason" placeholder="Why not? (at least 5 characters)" className="field" />
          <span className="flex gap-2">
            <button type="submit" disabled={busy} className="btn btn-primary btn-sm">
              Reject
            </button>
            <button type="button" className="link" onClick={() => setMode(null)}>
              Cancel
            </button>
          </span>
        </form>
      )}
      {error && (
        <span className="text-xs text-danger" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
