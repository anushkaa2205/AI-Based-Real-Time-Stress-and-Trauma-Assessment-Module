/**
 * OpenAPI 3.1 document generated from the Zod contracts (task 8.5, NFR-MNT, FR-API-01).
 * The contracts are the source of truth (CLAUDE.md "Coding conventions"); this file only
 * lists which contract belongs to which endpoint. Served at /api/docs/openapi.json.
 */
import { z } from "zod";
import * as I from "./integration";
import * as S from "./staff";
import * as V from "./interaction";

type Auth = "none" | "staff" | "api";
interface Op {
  method: "get" | "post" | "put" | "patch";
  path: string;
  tag: string;
  summary: string;
  auth: Auth;
  scope?: string;
  body?: z.ZodType;
  query?: z.ZodObject;
  response?: z.ZodType;
  status?: number;
  multipart?: boolean;
  sse?: boolean;
}

const st = "/api/v1/staff";
const ig = "/api/v1/integration/interactions";

export const OPERATIONS: Op[] = [

  // §5 staff
  { method: "post", path: `${st}/auth/login`, tag: "Staff", summary: "Sign in (step 1)", auth: "none", body: S.LoginRequest, response: S.LoginResponse },
  { method: "post", path: `${st}/auth/totp`, tag: "Staff", summary: "Authenticator code (step 2)", auth: "none", body: S.TotpRequest },
  { method: "get", path: `${st}/me`, tag: "Staff", summary: "Current user", auth: "staff", response: S.Me },
  { method: "patch", path: `${st}/me/duty`, tag: "Staff", summary: "Go on or off duty", auth: "staff", body: S.DutyRequest },
  { method: "get", path: `${st}/cases`, tag: "Cases", summary: "Risk-sorted queue", auth: "staff", query: S.CaseQueueQuery },
  { method: "get", path: `${st}/cases/{id}`, tag: "Cases", summary: "Case detail (audited)", auth: "staff", response: S.CaseDetailDto },
  { method: "patch", path: `${st}/cases/{id}`, tag: "Cases", summary: "Status and assignment", auth: "staff", body: S.CasePatchRequest, response: S.CaseDetailDto },
  { method: "post", path: `${st}/cases/{id}/band-override`, tag: "Cases", summary: "Change the band with a reason", auth: "staff", body: S.BandOverrideRequest, status: 201 },
  { method: "post", path: `${st}/cases/{id}/notes`, tag: "Cases", summary: "Add a note", auth: "staff", body: S.NoteRequest, status: 201 },
  { method: "get", path: `${st}/interactions/{id}/transcript`, tag: "Interactions", summary: "Transcript (audited)", auth: "staff" },
  { method: "get", path: `${st}/interactions/{id}/assessments`, tag: "Interactions", summary: "SVI timeline", auth: "staff" },
  { method: "get", path: `${st}/interactions/{id}/indicators`, tag: "Interactions", summary: "Indicators with evidence", auth: "staff" },
  { method: "get", path: `${st}/interactions/{id}/voice`, tag: "Interactions", summary: "Voice window features (no audio)", auth: "staff" },
  { method: "get", path: `${st}/interactions/{id}/emotions`, tag: "Interactions", summary: "Text, voice and fused emotion over time", auth: "staff" },
  { method: "get", path: `${st}/interactions/{id}/suggested-questions`, tag: "Interactions", summary: "Scripted next questions for the operator", auth: "staff" },
  { method: "post", path: `${st}/interactions/{id}/operator-message`, tag: "Interactions", summary: "Type what the caller said", auth: "staff", status: 201 },
  { method: "patch", path: `${st}/indicators/{id}`, tag: "Interactions", summary: "Confirm, reject or adjust an indicator", auth: "staff", body: S.IndicatorReviewRequest },
  { method: "get", path: `${st}/alerts`, tag: "Alerts", summary: "Open alerts (polling fallback)", auth: "staff", query: S.AlertQuery },
  { method: "post", path: `${st}/alerts/{id}/ack`, tag: "Alerts", summary: "Acknowledge", auth: "staff" },
  { method: "post", path: `${st}/alerts/{id}/resolve`, tag: "Alerts", summary: "Resolve", auth: "staff", body: S.ResolveRequest },
  { method: "get", path: `${st}/recommendations`, tag: "Referrals", summary: "Approval inbox", auth: "staff", query: S.RecommendationQuery },
  { method: "post", path: `${st}/recommendations/{id}/decision`, tag: "Referrals", summary: "Approve, reject or review", auth: "staff", body: S.DecisionRequest },
  { method: "get", path: `${st}/referrals`, tag: "Referrals", summary: "Referral queue (police/welfare: own role and district)", auth: "staff", query: S.ReferralQuery },
  { method: "get", path: `${st}/referrals/{id}`, tag: "Referrals", summary: "Referral", auth: "staff", response: S.ReferralDto },
  { method: "patch", path: `${st}/referrals/{id}`, tag: "Referrals", summary: "Update status", auth: "staff", body: S.ReferralPatch, response: S.ReferralDto },
  { method: "get", path: `${st}/follow-ups`, tag: "Referrals", summary: "Follow-ups", auth: "staff", query: S.FollowUpQuery },
  { method: "post", path: `${st}/cases/{id}/follow-ups`, tag: "Referrals", summary: "Schedule a follow-up", auth: "staff", body: S.FollowUpCreate, response: S.FollowUpItem, status: 201 },
  { method: "patch", path: `${st}/follow-ups/{id}`, tag: "Referrals", summary: "Record a follow-up outcome", auth: "staff", body: S.FollowUpPatch, response: S.FollowUpItem },
  ...(["summary", "heatmap", "trends", "capacity", "export.csv"] as const).map(
    (p): Op => ({ method: "get", path: `${st}/analytics/${p}`, tag: "Analytics", summary: `Anonymised ${p} (cells under 5 suppressed)`, auth: "staff", query: S.AnalyticsQuery }),
  ),

  // §6 integration
  { method: "post", path: ig, tag: "Integration", summary: "Start an interaction (consent already collected)", auth: "api", scope: "interactions:write", body: I.IntegrationStart, status: 201 },
  { method: "post", path: `${ig}/{id}/messages`, tag: "Integration", summary: "Send a text message (sender VICTIM is scored; OPERATOR is context only)", auth: "api", scope: "interactions:write", body: I.IntegrationMessage, status: 201 },
  { method: "post", path: `${ig}/{id}/audio`, tag: "Integration", summary: "Send a 5-second audio window (multipart: audio, windowIndex, startMs)", auth: "api", scope: "interactions:write", multipart: true, response: V.AudioResponse, status: 202 },
  { method: "put", path: `${ig}/{id}/context`, tag: "Integration", summary: "Case details from NHAA's record", auth: "api", scope: "interactions:write", body: V.ContextRequest },
  { method: "post", path: `${ig}/{id}/consent/withdraw`, tag: "Integration", summary: "Withdraw consent (analysis stops, stored audio deleted)", auth: "api", scope: "interactions:write", body: V.WithdrawRequest, response: V.WithdrawResponse },
  { method: "get", path: `${ig}/{id}/assessment`, tag: "Integration", summary: "Current SVI, band and top dimensions", auth: "api", scope: "assessments:read" },
  { method: "get", path: `${ig}/{id}/recommendations`, tag: "Integration", summary: "Recommendations", auth: "api", scope: "assessments:read" },
  { method: "get", path: `${ig}/{id}/stream`, tag: "Integration", summary: "Server-Sent Events: assessment.updated, emergency.show, recommendation.created", auth: "api", scope: "stream:read", sse: true },
  { method: "get", path: `${ig}/{id}/next-question`, tag: "Integration", summary: "Next scripted question for the calling system's chatbot (never a score, band or reason)", auth: "api", scope: "questions:read", response: I.NextQuestionResponse },
  { method: "post", path: `${ig}/{id}/end`, tag: "Integration", summary: "End the interaction", auth: "api", scope: "interactions:write", body: I.IntegrationEnd },
  { method: "get", path: "/api/v1/integration/cases/{docket}/status", tag: "Integration", summary: "Case status and arranged support (never scores, bands or indicators)", auth: "api", scope: "status:read", response: I.CaseStatusResponse },
];

const PROBLEM = {
  type: "object",
  properties: { type: { type: "string" }, title: { type: "string" }, status: { type: "integer" }, code: { type: "string" }, detail: { type: "string" }, instance: { type: "string" } },
  required: ["title", "status", "code"],
};

function schema(t: z.ZodType, io: "input" | "output") {
  // Preprocess/transform steps cannot be expressed exactly; they become permissive schemas.
  const s = z.toJSONSchema(t, { io, unrepresentable: "any", target: "draft-2020-12" }) as Record<string, unknown>;
  delete s.$schema;
  return s;
}

function queryParams(q: z.ZodObject) {
  const js = schema(q, "input") as { properties?: Record<string, unknown>; required?: string[] };
  return Object.entries(js.properties ?? {}).map(([name, s]) => ({ name, in: "query", required: (js.required ?? []).includes(name), schema: s }));
}

export function openApiDocument(serverUrl = "/") {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const op of OPERATIONS) {
    const params = [...op.path.matchAll(/\{(\w+)\}/g)].map((m) => ({ name: m[1], in: "path", required: true, schema: { type: "string" } }));
    const operation: Record<string, unknown> = {
      tags: [op.tag],
      summary: op.summary + (op.scope ? ` (scope: ${op.scope})` : ""),
      parameters: [...params, ...(op.query ? queryParams(op.query) : [])],
      security: op.auth === "none" ? [] : [{ [op.auth === "api" ? "apiKey" : "staffSession"]: [] }],
      responses: {
        [String(op.status ?? 200)]: op.sse
          ? { description: "Event stream", content: { "text/event-stream": { schema: { type: "string" } } } }
          : { description: "OK", ...(op.response ? { content: { "application/json": { schema: schema(op.response, "output") } } } : {}) },
        default: { description: "Error (problem+json, API_CONTRACTS §9)", content: { "application/problem+json": { schema: { $ref: "#/components/schemas/Problem" } } } },
      },
    };
    if (op.body) operation.requestBody = { required: true, content: { "application/json": { schema: schema(op.body, "input") } } };
    if (op.multipart)
      operation.requestBody = {
        required: true,
        content: {
          "multipart/form-data": {
            schema: {
              type: "object",
              properties: { audio: { type: "string", format: "binary", description: "webm/opus, ogg or wav; ≤ 6 s, ≤ 200 KB" }, windowIndex: { type: "integer" }, startMs: { type: "integer" } },
              required: ["audio", "windowIndex", "startMs"],
            },
          },
        },
      };
    (paths[op.path] ??= {})[op.method] = operation;
  }
  return {
    openapi: "3.1.0",
    info: {
      title: "NHAA stress and trauma assessment API",
      version: "1.0.0",
      description:
        "SIH26093. A plug-in assessment module: the integration API (text and audio from NHAA's systems; the only input) and the staff API (role-based, audited). Generated from the Zod contracts.",
    },
    servers: [{ url: serverUrl }],
    tags: ["Integration", "Staff", "Cases", "Interactions", "Alerts", "Referrals", "Analytics"].map((name) => ({ name })),
    paths,
    components: {
      schemas: { Problem: PROBLEM },
      securitySchemes: {
        apiKey: { type: "apiKey", in: "header", name: "Authorization", description: "ApiKey <prefix>.<secret>" },
        staffSession: { type: "apiKey", in: "cookie", name: "authjs.session-token", description: "Staff sign-in with TOTP" },
      },
    },
  };
}
