/** Integration API contracts (task 8.4, API_CONTRACTS §6, FR-API-01…04). */
import { z } from "zod";
import { Channel } from "./common";
import { ConsentRequest, VictimLang } from "./interaction";

export const IntegrationStart = z.object({
  channel: Channel,
  language: VictimLang,
  /** FR-API-04: link to an existing NHAA docket, or create the case under this number */
  docketNumber: z.string().regex(/^NHAA-\d{4}-[A-Z]{2}-\d{6}$/).nullable().optional(),
  districtCode: z.string().max(20).nullable().optional(),
  externalRef: z.string().trim().max(100).optional(),
  /** The integrating system collected consent and passes the exact notice version it showed. */
  consent: ConsentRequest,
});

export const IntegrationMessage = z.object({
  text: z.string().trim().min(1).max(2000),
  sender: z.enum(["VICTIM", "OPERATOR"]).default("VICTIM"),
});

export const IntegrationEnd = z.object({ reason: z.enum(["COMPLETED", "TIMEOUT"]).default("COMPLETED") });
