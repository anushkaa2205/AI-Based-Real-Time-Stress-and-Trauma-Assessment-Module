/**
 * GET /api/docs (task 8.5): a readable API reference rendered from the same operation list as
 * the OpenAPI document (no external scripts). The machine-readable spec is at /api/docs/openapi.json.
 */
import { OPERATIONS } from "@/contracts/openapi";

export const dynamic = "force-static";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const AUTH: Record<string, string> = { none: "public", victim: "victim session", staff: "staff sign-in", api: "API key" };

export function GET() {
  const tags = [...new Set(OPERATIONS.map((o) => o.tag))];
  const sections = tags
    .map((tag) => {
      const rows = OPERATIONS.filter((o) => o.tag === tag)
        .map(
          (o) =>
            `<tr><td><code class="m ${o.method}">${o.method.toUpperCase()}</code></td><td><code>${esc(o.path)}</code></td><td>${esc(o.summary)}</td><td>${AUTH[o.auth]}${o.scope ? `<br><small>${esc(o.scope)}</small>` : ""}</td></tr>`,
        )
        .join("");
      return `<h2 id="${tag}">${tag}</h2><table><thead><tr><th>Method</th><th>Path</th><th>What it does</th><th>Auth</th></tr></thead><tbody>${rows}</tbody></table>`;
    })
    .join("");
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>NHAA API reference</title>
<style>
:root{--bg:#fcfcfb;--ink:#0b0b0b;--muted:#52514e;--line:#e1e0d9;--chip:#eef3fb}
@media (prefers-color-scheme:dark){:root{--bg:#1a1a19;--ink:#f0efec;--muted:#c3c2b7;--line:#2c2c2a;--chip:#22324a}}
body{margin:0;padding:24px 16px;background:var(--bg);color:var(--ink);font:15px/1.5 system-ui,sans-serif;max-width:1100px;margin-inline:auto}
table{border-collapse:collapse;width:100%;margin-bottom:24px}th,td{text-align:left;padding:6px 8px;border-bottom:1px solid var(--line);vertical-align:top}
th{color:var(--muted);font-weight:600;font-size:13px}code{font-size:13px;word-break:break-all}.m{background:var(--chip);border-radius:4px;padding:1px 6px;font-weight:600}
p{color:var(--muted)}a{color:inherit}
</style></head><body>
<h1>NHAA stress and trauma assessment API</h1>
<p>Generated from the Zod contracts. Machine-readable spec: <a href="/api/docs/openapi.json">/api/docs/openapi.json</a>.
Victim endpoints never return scores. Errors use problem+json with a <code>code</code>.
Integration requests send <code>Authorization: ApiKey &lt;prefix&gt;.&lt;secret&gt;</code>.</p>
${sections}
</body></html>`;
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" } });
}
