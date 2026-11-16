/**
 * Route review against the permission matrix (task 9.5, AC-SEC-01, NFR-PRI-02).
 * Every API route file must declare how it is guarded, so a new route cannot ship open by
 * accident. The matrix itself is tested in policies.test.ts; police/welfare 403s in e2e.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const API = resolve(__dirname, "../../src/app/api");

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? routeFiles(p) : f === "route.ts" ? [p] : [];
  });
}

const files = routeFiles(API).map((f) => ({ path: relative(API, f).replace(/\\/g, "/"), src: readFileSync(f, "utf8") }));
const handlers = (src: string) =>
  [...src.matchAll(/export const (GET|POST|PUT|PATCH|DELETE) = route\(\s*\{([^}]*)\}/g)].map((m) => ({ method: m[1]!, opts: m[2]! }));

/** Routes that are deliberately public, and why. */
const PUBLIC = new Set([
  "v1/staff/auth/login/route.ts", // sign-in (rate limited)
  "v1/staff/auth/totp/route.ts", // second step of sign-in
  "v1/staff/auth/logout/route.ts",
  "v1/staff/health/route.ts", // no data
]);

describe("every API route is guarded (task 9.5)", () => {
  it("found the routes", () => {
    expect(files.length).toBeGreaterThan(60);
  });

  for (const f of files) {
    it(f.path, () => {
      if (f.path.startsWith("docs/")) return; // static API reference, no data
      if (f.path.startsWith("auth/")) return; // Auth.js handler
      if (f.path === "v1/internal/jobs/run/route.ts") {
        expect(f.src).toMatch(/timingSafeEqual/); // shared-secret check
        return;
      }
      if (f.path.startsWith("v1/realtime/")) {
        expect(f.src).toMatch(/currentStaff|staffCanSubscribe|auth: "staff"/);
        return;
      }
      if (f.path.startsWith("demo/")) {
        // Public demo (plan §7, task N.4): every handler goes through publicDemoRoute (checked below),
        // and a route under /interactions/{id}/ must be limited to the browser's own cases.
        const exported = [...f.src.matchAll(/export const (GET|POST|PUT|PATCH|DELETE) = (\w+)\(/g)];
        expect(exported.length, "exports a handler").toBeGreaterThan(0);
        for (const m of exported) expect(m[2], `${m[1]}: publicDemoRoute`).toBe("publicDemoRoute");
        if (f.path.startsWith("demo/interactions/[id]/")) expect(f.src, `${f.path}: owned`).toMatch(/owned: true/);
        return;
      }
      const hs = handlers(f.src);
      expect(hs.length, "uses the route() helper").toBeGreaterThan(0);
      for (const h of hs) {
        if (PUBLIC.has(f.path)) continue;
        if (f.path.startsWith("v1/staff/")) {
          expect(h.opts, `${h.method}: staff auth`).toMatch(/auth: "staff"/);
          expect(h.opts, `${h.method}: names a permission`).toMatch(/action: "[a-zA-Z.]+"/);
        } else if (f.path.startsWith("v1/integration/")) {
          expect(h.opts, `${h.method}: API key`).toMatch(/auth: "api"/);
          expect(h.opts, `${h.method}: names a scope`).toMatch(/scope: "[a-z:]+"/);
        } else {
          throw new Error(`unknown route group: ${f.path}`);
        }
      }
    });
  }

  it("publicDemoRoute answers 404 when the demo is off, refuses cross-site posts and limits every visitor (plan §7)", () => {
    const src = readFileSync(resolve(__dirname, "../../src/core/demo/public.ts"), "utf8");
    expect(src).toMatch(/if \(!demoEnabled\(\)\) return problemResponse\(new ApiError\("NOT_FOUND"\)/);
    expect(src).toMatch(/!sameSite\(req\.headers\)/);
    expect(src).toMatch(/rateLimit: \{ limit: DEMO_LIMITS\[opts\.limit\]/);
    expect(src).toMatch(/if \(opts\.owned\) assertOwned/);
  });

  it("has no victim API and no endpoint for structured answers (FR-CH-01, FR-API-05, AC-CH-07)", () => {
    expect(files.filter((f) => f.path.startsWith("v1/victim/")).map((f) => f.path)).toEqual([]);
    expect(files.filter((f) => /screeners|next\/route|callback-request/.test(f.path)).map((f) => f.path)).toEqual([]);
    for (const f of files) expect(f.src, f.path).not.toMatch(/auth: "victim"/);
  });

  it("police and welfare can only reach referral endpoints (rule 8)", async () => {
    const { access } = await import("@/core/policies/rbac");
    const { ACTIONS } = await import("@/core/policies/rbac");
    for (const role of ["POLICE_LIAISON", "WELFARE_OFFICER"] as const) {
      const allowed = ACTIONS.filter((a) => access({ id: "u", role, districtId: "d" }, a) !== null);
      expect(allowed.sort()).toEqual(["referral.list", "referral.update", "staff.self"]);
    }
  });
});
