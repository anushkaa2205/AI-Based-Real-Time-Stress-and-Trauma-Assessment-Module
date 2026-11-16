/** OpenAPI (task 8.5): the document is valid-shaped and every documented endpoint really exists. */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { OPERATIONS, openApiDocument } from "@/contracts/openapi";

const APP = resolve(__dirname, "../../src/app");

/** /api/v1/staff/cases/{id} → src/app/api/v1/staff/cases/[id]/route.ts */
function routeFile(path: string): string {
  return resolve(APP, `.${path.replace(/\{(\w+)\}/g, "[$1]")}/route.ts`);
}

describe("OpenAPI document (task 8.5)", () => {
  const doc = openApiDocument();

  it("is OpenAPI 3.1 with every operation and the two auth schemes (no victim session)", () => {
    expect(doc.openapi).toBe("3.1.0");
    const count = Object.values(doc.paths).reduce((n, p) => n + Object.keys(p).length, 0);
    expect(count).toBe(OPERATIONS.length);
    expect(Object.keys(doc.components.securitySchemes)).toEqual(["apiKey", "staffSession"]);
  });

  it("documents request bodies from the Zod contracts", () => {
    const start = doc.paths["/api/v1/integration/interactions"]!.post as { requestBody: { content: Record<string, { schema: { properties: Record<string, unknown> } }> } };
    expect(Object.keys(start.requestBody.content["application/json"]!.schema.properties)).toEqual(expect.arrayContaining(["channel", "language", "docketNumber", "consent"]));
  });

  it("every documented endpoint has a route file exporting that method (docs cannot drift)", () => {
    for (const op of OPERATIONS) {
      const file = routeFile(op.path);
      expect(existsSync(file), `${op.method.toUpperCase()} ${op.path} → ${file}`).toBe(true);
      expect(readFileSync(file, "utf8"), `${op.method.toUpperCase()} ${op.path}`).toMatch(new RegExp(`export (const|async function|function) ${op.method.toUpperCase()}\\b`));
    }
  });
});

describe("case status endpoint (N.3)", () => {
  it("is documented behind the status:read scope and returns no diagnostic field", async () => {
    const { openApiDocument } = await import("@/contracts/openapi");
    const doc = openApiDocument() as { paths: Record<string, { get?: { security?: unknown; responses: Record<string, { content?: Record<string, { schema: { properties?: Record<string, unknown> } }> }> } }> };
    const op = doc.paths["/api/v1/integration/cases/{docket}/status"]?.get;
    expect(op).toBeTruthy();
    expect(JSON.stringify(op)).toContain("status:read");
    const props = Object.keys(op!.responses["200"]?.content?.["application/json"]?.schema.properties ?? {}).sort();
    expect(props).toEqual(["docketNumber", "registeredAt", "status", "support", "updatedAt"]);
  });
});
