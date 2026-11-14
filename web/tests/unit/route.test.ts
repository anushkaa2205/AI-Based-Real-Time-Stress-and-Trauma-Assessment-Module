/** Route helper (task 1.8) with authentication and the database mocked out. */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { StaffUser } from "@/lib/staff-session";

const state = vi.hoisted(() => ({ user: null as StaffUser | null, hits: 0 }));

vi.mock("@/lib/staff-session", () => ({ currentStaff: async () => state.user }));
vi.mock("@/lib/db", () => ({ db: async () => undefined }));
vi.mock("@/lib/ratelimit", async (orig) => {
  const real = await orig<typeof import("@/lib/ratelimit")>();
  return {
    ...real,
    mongoRateLimitStore: { hit: async () => ++state.hits },
  };
});

const { route } = await import("@/lib/route");

const staff = (role: StaffUser["role"]): StaffUser => ({
  id: "0123456789abcdef01234567",
  role,
  districtId: "d1",
  stateId: "s1",
  isOnDuty: false,
  name: "Test User",
  email: "t@example.org",
  languages: [],
});

const req = (method: string, body?: unknown, headers: Record<string, string> = {}) =>
  new NextRequest("http://localhost:3000/api/v1/staff/test", {
    method,
    headers: { host: "localhost:3000", "content-type": "application/json", ...headers },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });

const seg = { params: Promise.resolve({}) };

beforeEach(() => {
  state.user = null;
  state.hits = 0;
});

describe("route helper (task 1.8)", () => {
  const echo = route({ auth: "staff", action: "case.list", body: z.object({ n: z.number() }) }, async ({ body }) => ({
    got: body.n,
  }));

  it("returns 401 problem+json when signed out", async () => {
    const res = await echo(req("POST", { n: 1 }), seg);
    expect(res.status).toBe(401);
    expect(res.headers.get("content-type")).toContain("application/problem+json");
    const body = await res.json();
    expect(body).toMatchObject({ code: "UNAUTHENTICATED", status: 401, instance: "/api/v1/staff/test" });
    expect(body.requestId).toMatch(/^req_/);
    expect(res.headers.get("x-request-id")).toBe(body.requestId);
  });

  it("returns 403 when the role may not call the endpoint (police on the case queue)", async () => {
    state.user = staff("POLICE_LIAISON");
    const res = await echo(req("POST", { n: 1 }), seg);
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("FORBIDDEN");
  });

  it("validates the body and lists field errors", async () => {
    state.user = staff("COUNSELLOR");
    const res = await echo(req("POST", { n: "x" }), seg);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("VALIDATION_FAILED");
    expect(body.errors[0].path).toBe("n");
  });

  it("rejects malformed JSON", async () => {
    state.user = staff("COUNSELLOR");
    const res = await echo(req("POST", "{not json"), seg);
    expect((await res.json()).code).toBe("VALIDATION_FAILED");
  });

  it("runs the handler and adds request-id and rate-limit headers", async () => {
    state.user = staff("COUNSELLOR");
    const res = await echo(req("POST", { n: 7 }), seg);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ got: 7 });
    expect(res.headers.get("ratelimit-limit")).toBe("300");
    expect(res.headers.get("x-request-id")).toMatch(/^req_/);
  });

  it("blocks cross-site POSTs", async () => {
    state.user = staff("COUNSELLOR");
    const res = await echo(req("POST", { n: 1 }, { origin: "https://evil.example" }), seg);
    expect(res.status).toBe(403);
  });

  it("returns 429 with Retry-After over the limit", async () => {
    state.user = staff("COUNSELLOR");
    state.hits = 300;
    const res = await echo(req("POST", { n: 1 }), seg);
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBeTruthy();
  });

  it("hides unexpected errors behind a generic 500 without leaking the message", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const boom = route({ auth: "public", rateLimit: false }, async () => {
      throw new Error("synthetic secret detail");
    });
    const res = await boom(req("GET"), seg);
    expect(res.status).toBe(500);
    expect(await res.text()).not.toContain("synthetic secret detail");
    expect(spy.mock.calls.flat().join(" ")).not.toContain("synthetic secret detail");
    spy.mockRestore();
  });

  it("lets handlers make resource-level checks", async () => {
    state.user = staff("DISTRICT_OFFICER");
    const detail = route({ auth: "staff", rateLimit: false }, async ({ authorize }) => ({
      level: authorize("case.read", { districtId: "d1" }),
    }));
    expect(await (await detail(req("GET"), seg)).json()).toEqual({ level: "reduced" });
    const other = route({ auth: "staff", rateLimit: false }, async ({ authorize }) => authorize("case.read", { districtId: "d2" }));
    expect((await other(req("GET"), seg)).status).toBe(403);
  });
});
