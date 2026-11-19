/** Integration API contracts (task 8.4, API_CONTRACTS §6, FR-API-01…04). */
import { z } from "zod";
import { Channel } from "./common";
import { CASE_STATUSES, SUPPORT_TYPES } from "@/models/enums";
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

/**
 * Version of the integration contract, sent as `X-Contract-Version` on every integration response
 * (task M.6, gap V2). 1.1: `inputMethod`, `GET …/indicators` (M.5). 1.2: `GET /cases/{docket}/status`
 * (N.3). 1.3: `GET …/next-question` (P.3). 1.4: `PUT …/language` (P.11).
 */
export const INTEGRATION_CONTRACT_VERSION = "1.4";

export const IntegrationMessage = z.object({
  text: z.string().trim().min(1).max(2000),
  sender: z.enum(["VICTIM", "OPERATOR"]).default("VICTIM"),
  /** M.6: TEXT (typed) or TRANSCRIPT (the calling system's own speech-to-text); default TEXT */
  inputMethod: z.enum(["TEXT", "TRANSCRIPT"]).default("TEXT"),
});

export const IntegrationEnd = z.object({ reason: z.enum(["COMPLETED", "TIMEOUT"]).default("COMPLETED") });

/** GET /cases/{docket}/status (task N.3): status and arranged support only. Never a score, band or indicator (rule 1). */
export const CaseStatusResponse = z.object({
  docketNumber: z.string(),
  status: z.enum(CASE_STATUSES),
  registeredAt: z.string(),
  updatedAt: z.string(),
  support: z.array(z.enum(SUPPORT_TYPES)),
});
export type CaseStatusResponse = z.infer<typeof CaseStatusResponse>;

/** GET …/next-question (task P.3, API_CONTRACTS §6.7): a scripted question key and its wording, or null. Nothing else. */
export const NextQuestionResponse = z.object({
  question: z
    .object({ key: z.string().regex(/^operatorQuestions\.[A-Za-z]+$/), text: z.string().min(1) })
    .strict()
    .nullable(),
}).strict();
export type NextQuestionResponse = z.infer<typeof NextQuestionResponse>;

/** PUT …/language (task P.11, API_CONTRACTS §6.8): the conversation's new language. */
export const LanguageRequest = z.object({ language: VictimLang }).strict();
export type LanguageRequest = z.infer<typeof LanguageRequest>;

/** The new language and the scripted questions asked so far, re-worded in it. Nothing else (rule 1). */
export const LanguageResponse = z
  .object({
    language: VictimLang,
    asked: z.array(z.object({ key: z.string().regex(/^operatorQuestions\.[A-Za-z]+$/), text: z.string().min(1) }).strict()),
  })
  .strict();
export type LanguageResponse = z.infer<typeof LanguageResponse>;
