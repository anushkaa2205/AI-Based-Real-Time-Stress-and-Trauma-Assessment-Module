/**
 * Errors as application/problem+json (RFC 9457) with the stable codes from
 * API_CONTRACTS.md §9. Messages never contain victim content or secrets.
 */

export const ERROR_CODES = {
  VALIDATION_FAILED: { status: 400, title: "Validation failed" },
  BAD_AUDIO: { status: 400, title: "Audio could not be decoded" },
  UNAUTHENTICATED: { status: 401, title: "Sign-in required" },
  SESSION_EXPIRED: { status: 401, title: "Session expired" },
  INVALID_API_KEY: { status: 401, title: "Invalid API key" },
  TOTP_REQUIRED: { status: 401, title: "Authenticator code required" },
  FORBIDDEN: { status: 403, title: "Forbidden" },
  SCOPE_MISSING: { status: 403, title: "Scope missing" },
  CONSENT_NOT_GIVEN_FOR_SHARING: { status: 403, title: "Consent not given for sharing" },
  NOT_FOUND: { status: 404, title: "Not found" },
  CONSENT_REQUIRED: { status: 409, title: "Consent required" },
  INTERACTION_ENDED: { status: 409, title: "Interaction ended" },
  ALREADY_ACKNOWLEDGED: { status: 409, title: "Already acknowledged" },
  INVALID_TRANSITION: { status: 409, title: "Invalid status change" },
  DUPLICATE_WINDOW: { status: 409, title: "Duplicate voice window" },
  LINE_BUSY: { status: 409, title: "The line is busy" }, // public portal (plan §7): one live microphone call at a time
  PAYLOAD_TOO_LARGE: { status: 413, title: "Payload too large" },
  REASON_REQUIRED: { status: 422, title: "Reason required" },
  FOLLOW_UP_REQUIRED: { status: 422, title: "Follow-up required" },
  INVALID_CONFIG: { status: 422, title: "Invalid configuration" },
  REFERRAL_TOO_DETAILED: { status: 422, title: "Referral text too detailed" },
  RATE_LIMITED: { status: 429, title: "Too many requests" },
  ANALYSIS_DEGRADED: { status: 503, title: "Analysis degraded" },
  INTERNAL: { status: 500, title: "Something went wrong" },
} as const;

export type ErrorCode = keyof typeof ERROR_CODES;

export interface FieldError {
  path: string;
  message: string;
}

export class ApiError extends Error {
  readonly status: number;
  readonly title: string;
  constructor(
    readonly code: ErrorCode,
    readonly detail?: string,
    readonly extra?: { errors?: FieldError[]; headers?: Record<string, string> },
  ) {
    super(detail ?? ERROR_CODES[code].title);
    this.name = "ApiError";
    this.status = ERROR_CODES[code].status;
    this.title = ERROR_CODES[code].title;
  }
}

export interface ProblemBody {
  type: string;
  title: string;
  status: number;
  code: ErrorCode;
  detail?: string;
  instance: string;
  requestId: string;
  errors?: FieldError[];
}

const TYPE_BASE = "https://nhaa-assess.example/errors/";

export function problemBody(err: ApiError, instance: string, requestId: string): ProblemBody {
  const body: ProblemBody = {
    type: TYPE_BASE + err.code.toLowerCase().replace(/_/g, "-"),
    title: err.title,
    status: err.status,
    code: err.code,
    instance,
    requestId,
  };
  if (err.detail) body.detail = err.detail;
  if (err.extra?.errors) body.errors = err.extra.errors;
  return body;
}

export function problemResponse(err: ApiError, instance: string, requestId: string): Response {
  return new Response(JSON.stringify(problemBody(err, instance, requestId)), {
    status: err.status,
    headers: {
      "Content-Type": "application/problem+json; charset=utf-8",
      "X-Request-Id": requestId,
      ...(err.extra?.headers ?? {}),
    },
  });
}
