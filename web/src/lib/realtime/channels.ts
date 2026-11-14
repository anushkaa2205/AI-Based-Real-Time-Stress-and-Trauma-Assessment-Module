/**
 * Real-time channels and events (task 5.1, API_CONTRACTS §7). Pure.
 *
 * Two deliberate differences from §7, both for privacy (logged for the docs):
 *  - The victim's browser gets its OWN channel, `private-victim-{id}`, carrying
 *    only `emergency.show`. A shared channel would also deliver staff events
 *    with the SVI to the victim (CLAUDE.md rule 1).
 *  - `transcript.appended` carries ids only, no message text: the transport may
 *    be a third-party service (Pusher); staff fetch the text over our own API.
 */
import type { ReferralDto } from "@/contracts/staff";
import type { EmergencyPanel } from "@/contracts/victim";
import type { RiskBand, Role } from "@/models/enums";

export const ONCALL = "private-oncall";
export const SUPERVISORS = "private-supervisors";
export const QUEUE_NATIONAL = "private-queue-national";

export const interactionChannel = (interactionId: string) => `private-interaction-${interactionId}`;
export const victimChannel = (interactionId: string) => `private-victim-${interactionId}`;
export const queueChannel = (districtId: string) => `private-queue-${districtId}`;
export const roleChannel = (role: Role, districtId: string) => `private-role-${role}-${districtId}`;

export type ParsedChannel =
  | { kind: "interaction"; id: string }
  | { kind: "victim"; id: string }
  | { kind: "queue"; districtId: string | null }
  | { kind: "oncall" }
  | { kind: "supervisors" }
  | { kind: "role"; role: string; districtId: string };

const OID = "[a-f0-9]{24}";

export function parseChannel(name: string): ParsedChannel | null {
  if (name === ONCALL) return { kind: "oncall" };
  if (name === SUPERVISORS) return { kind: "supervisors" };
  if (name === QUEUE_NATIONAL) return { kind: "queue", districtId: null };
  let m = new RegExp(`^private-interaction-(${OID})$`).exec(name);
  if (m) return { kind: "interaction", id: m[1]! };
  m = new RegExp(`^private-victim-(${OID})$`).exec(name);
  if (m) return { kind: "victim", id: m[1]! };
  m = new RegExp(`^private-queue-(${OID})$`).exec(name);
  if (m) return { kind: "queue", districtId: m[1]! };
  m = new RegExp(`^private-role-([A-Z_]+)-(${OID})$`).exec(name);
  if (m) return { kind: "role", role: m[1]!, districtId: m[2]! };
  return null;
}

export interface EventMap {
  "assessment.updated":
    | {
        interactionId: string;
        assessmentId: string;
        seq: number;
        svi: number;
        band: RiskBand;
        previousBand: RiskBand | null;
        overridesFired: string[];
        topEvidence: { dimension: string; label: string }[];
        confidence: number;
        limitedConfidence: boolean;
      }
    | { caseId: string; band: RiskBand | null; svi: number | null };
  "transcript.appended": { interactionId: string; messageId: string; seq: number; sender: string; language: string };
  "emergency.show": { emergency: EmergencyPanel };
  "case.created": CaseEventData;
  "case.updated": CaseEventData;
  "alert.created": { alertId: string; caseId: string; docketNumber: string; level: "HIGH" | "CRITICAL"; reason: string; createdAt: string };
  "alert.acknowledged": { alertId: string; caseId: string; acknowledgedBy: { id: string; name: string }; acknowledgedAt: string };
  "alert.escalated": { alertId: string; caseId: string; docketNumber: string; level: "HIGH" | "CRITICAL"; escalationLevel: number; waitingSec: number };
  "recommendation.created": { recommendationId: string; type: string; urgency: string; status: string };
  /** ReferralDto, already minimal (§7); goes to role-{ROLE}-{district} only. */
  "referral.created": ReferralDto;
  "referral.updated": ReferralDto;
  /** Follow-up reminder (FR-REC-09); ids and time only. */
  "followup.due": { followUpId: string; caseId: string; docketNumber: string; dueAt: string };
}

export interface CaseEventData {
  caseId: string;
  docketNumber: string;
  band: RiskBand | null;
  svi: number | null;
  status: string;
  assignedToId: string | null;
  waitingSince: string;
}

export type EventName = keyof EventMap;

export interface OutboundEvent<E extends EventName = EventName> {
  channel: string;
  event: E;
  data: EventMap[E];
}

/** Envelope sent to clients (§7). */
export interface Envelope {
  event: EventName;
  id: string;
  at: string;
  data: unknown;
}

/** Queue channels for a case: its district (if any) and the national queue. */
export function queueChannelsFor(districtId: string | null | undefined): string[] {
  return districtId ? [queueChannel(districtId), QUEUE_NATIONAL] : [QUEUE_NATIONAL];
}
