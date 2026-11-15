"use client";

/**
 * System admin console (task 8.6, FR-SVI-06, API_CONTRACTS §5.9): staff users, API clients and
 * scoring configuration versions (create from the active one, simulate on the evaluation set,
 * activate). One-time secrets (temporary password, TOTP link, API key) are shown once here
 * and never again.
 */
import { useCallback, useEffect, useState, type FormEvent } from "react";

interface UserRow {
  id: string;
  email: string;
  name: string;
  role: string;
  districtId: string | null;
  isActive: boolean;
  lastLoginAt: string | null;
}
interface ClientRow {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  rateLimitPerMin: number;
  isActive: boolean;
}
interface ConfigRow {
  id: string;
  version: number;
  isActive: boolean;
  notes: string | null;
  createdAt: string;
  config: Record<string, unknown>;
}
interface Sim {
  scenarios: number;
  bandAccuracy: number;
  recallSuicidal: number | null;
  recallDanger: number | null;
  confusionMatrix: number[][];
}

const ROLES = ["OPERATOR", "NHAA_SUPERVISOR", "COUNSELLOR", "DISTRICT_OFFICER", "POLICE_LIAISON", "WELFARE_OFFICER", "STATE_ADMIN", "MINISTRY_ADMIN", "SYS_ADMIN", "AUDITOR"];
const BANDS = ["LOW", "MODERATE", "HIGH", "CRITICAL"];
const lower = (s: string) => s.replace(/_/g, " ").toLowerCase();
const pct = (x: number | null) => (x === null ? "–" : `${Math.round(x * 100)}%`);

async function call<T>(method: string, url: string, body?: unknown): Promise<{ ok: boolean; data: T & { detail?: string; title?: string } }> {
  const res = await fetch(url, { method, headers: body ? { "content-type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined, cache: "no-store" }).catch(() => null);
  const data = (res && res.status !== 204 ? await res.json().catch(() => ({})) : {}) as T & { detail?: string; title?: string };
  return { ok: !!res?.ok, data };
}

function Secret({ label, value }: { label: string; value: string }) {
  return (
    <p className="rounded border border-amber-600 bg-amber-50 p-2 text-sm text-amber-950" data-testid="one-time-secret">
      <strong>{label} (shown once):</strong> <code className="break-all">{value}</code>
    </p>
  );
}

export function AdminConsole({ districts }: { districts: { id: string; name: string }[] }) {
  const [tab, setTab] = useState<"users" | "clients" | "configs">("users");
  const [users, setUsers] = useState<UserRow[]>([]);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [configs, setConfigs] = useState<ConfigRow[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [secrets, setSecrets] = useState<{ label: string; value: string }[]>([]);
  const [draft, setDraft] = useState("");
  const [sims, setSims] = useState<Record<string, Sim>>({});

  const load = useCallback(async () => {
    const [u, c, s] = await Promise.all([
      call<{ items: UserRow[] }>("GET", "/api/v1/staff/admin/users"),
      call<{ items: ClientRow[] }>("GET", "/api/v1/staff/admin/api-clients"),
      call<{ items: ConfigRow[] }>("GET", "/api/v1/staff/admin/scoring-configs"),
    ]);
    setUsers(u.data.items ?? []);
    setClients(c.data.items ?? []);
    setConfigs(s.data.items ?? []);
  }, []);
  useEffect(() => {
    const first = setTimeout(load, 0);
    return () => clearTimeout(first);
  }, [load]);

  const say = (ok: boolean, data: { detail?: string; title?: string }, success: string) => setMsg(ok ? success : (data.detail ?? data.title ?? "Something went wrong"));
  const districtName = (id: string | null) => districts.find((d) => d.id === id)?.name ?? "–";

  async function createUser(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const r = await call<{ temporaryPassword: string; totpUri: string | null }>("POST", "/api/v1/staff/admin/users", {
      email: f.get("email"),
      name: f.get("name"),
      role: f.get("role"),
      districtId: f.get("districtId") || null,
    });
    say(r.ok, r.data, "User created. Give them these details in person; they are not shown again.");
    if (r.ok) {
      setSecrets([{ label: "Temporary password", value: r.data.temporaryPassword }, ...(r.data.totpUri ? [{ label: "Authenticator setup link", value: r.data.totpUri }] : [])]);
      form.reset();
      void load();
    }
  }

  async function patchUser(id: string, body: Record<string, unknown>, success: string) {
    const r = await call<{ temporaryPassword: string | null }>("PATCH", `/api/v1/staff/admin/users/${id}`, body);
    say(r.ok, r.data, success);
    if (r.ok && r.data.temporaryPassword) setSecrets([{ label: "New temporary password", value: r.data.temporaryPassword }]);
    void load();
  }

  async function createClient(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const scopes = ["interactions:write", "assessments:read", "stream:read"].filter((s) => f.get(s));
    const r = await call<{ key: string }>("POST", "/api/v1/staff/admin/api-clients", { name: f.get("name"), scopes, rateLimitPerMin: Number(f.get("rpm") || 120) });
    say(r.ok, r.data, "API client created. Copy the key now; it is not shown again.");
    if (r.ok) {
      setSecrets([{ label: "API key", value: r.data.key }]);
      form.reset();
      void load();
    }
  }

  async function revoke(id: string) {
    if (!confirm("Revoke this key? Systems using it stop working at once.")) return;
    const r = await call("DELETE", `/api/v1/staff/admin/api-clients/${id}`);
    say(r.ok, r.data, "Key revoked.");
    void load();
  }

  function startDraft() {
    const active = configs.find((c) => c.isActive) ?? configs[0];
    if (!active) return;
    const cfg = { ...active.config };
    delete cfg.version;
    delete cfg.isActive;
    delete cfg.notes;
    setDraft(JSON.stringify({ ...cfg, notes: `Based on v${active.version}` }, null, 2));
  }

  async function saveDraft() {
    let body: unknown;
    try {
      body = JSON.parse(draft);
    } catch {
      setMsg("The configuration is not valid JSON.");
      return;
    }
    const r = await call<{ version: number }>("POST", "/api/v1/staff/admin/scoring-configs", body);
    say(r.ok, r.data, `Saved as version ${r.data.version} (not active yet). Simulate it before activating.`);
    if (r.ok) {
      setDraft("");
      void load();
    }
  }

  async function simulate(id: string) {
    setMsg("Running the evaluation set…");
    const r = await call<Sim>("POST", `/api/v1/staff/admin/scoring-configs/${id}/simulate`);
    say(r.ok, r.data, "Simulation finished.");
    if (r.ok) setSims((s) => ({ ...s, [id]: r.data }));
  }

  async function activate(c: ConfigRow) {
    if (!confirm(`Activate version ${c.version}? Live interactions are re-scored with it. Human band locks stay.`)) return;
    const r = await call<{ version: number; rescored: number }>("POST", `/api/v1/staff/admin/scoring-configs/${c.id}/activate`);
    say(r.ok, r.data, `Version ${r.data.version} is active; ${r.data.rescored} live interaction(s) re-scored.`);
    void load();
  }

  const tabBtn = (k: typeof tab, label: string) => (
    <button type="button" onClick={() => setTab(k)} className={`rounded px-3 py-1 text-sm ${tab === k ? "bg-primary text-primary-foreground" : "border border-border"}`} aria-pressed={tab === k}>
      {label}
    </button>
  );
  const input = "rounded border border-border bg-background p-1 text-sm";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2" role="group" aria-label="Sections">
        {tabBtn("users", "Staff users")}
        {tabBtn("clients", "API clients")}
        {tabBtn("configs", "Scoring versions")}
      </div>
      {msg && (
        <p role="status" className="text-sm" data-testid="admin-message">
          {msg}
        </p>
      )}
      {secrets.map((s) => (
        <Secret key={s.label} {...s} />
      ))}

      {tab === "users" && (
        <section className="flex flex-col gap-3">
          <form onSubmit={createUser} className="flex flex-wrap items-end gap-2 rounded-md border border-border p-3" data-testid="user-form">
            <label className="flex flex-col text-xs">
              Name
              <input name="name" required minLength={2} className={input} />
            </label>
            <label className="flex flex-col text-xs">
              E-mail
              <input name="email" type="email" required className={input} />
            </label>
            <label className="flex flex-col text-xs">
              Role
              <select name="role" className={input}>
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {lower(r)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col text-xs">
              District (district roles, state admin)
              <select name="districtId" className={input}>
                <option value="">–</option>
                {districts.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className="rounded bg-primary px-3 py-1 text-sm text-primary-foreground">
              Create user
            </button>
          </form>
          <table className="text-sm" data-testid="users">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="p-1">Name</th>
                <th className="p-1">E-mail</th>
                <th className="p-1">Role</th>
                <th className="p-1">District</th>
                <th className="p-1">Last sign-in</th>
                <th className="p-1" />
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className={`border-t border-border ${u.isActive ? "" : "text-muted-foreground line-through"}`}>
                  <td className="p-1">{u.name}</td>
                  <td className="p-1">{u.email}</td>
                  <td className="p-1">{lower(u.role)}</td>
                  <td className="p-1">{districtName(u.districtId)}</td>
                  <td className="p-1">{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : "never"}</td>
                  <td className="flex gap-2 p-1">
                    <button type="button" className="underline" onClick={() => patchUser(u.id, { isActive: !u.isActive }, u.isActive ? "User deactivated." : "User reactivated.")}>
                      {u.isActive ? "Deactivate" : "Reactivate"}
                    </button>
                    <button type="button" className="underline" onClick={() => patchUser(u.id, { resetPassword: true }, "Password reset.")}>
                      Reset password
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {tab === "clients" && (
        <section className="flex flex-col gap-3">
          <form onSubmit={createClient} className="flex flex-wrap items-end gap-3 rounded-md border border-border p-3">
            <label className="flex flex-col text-xs">
              System name
              <input name="name" required minLength={2} className={input} />
            </label>
            {["interactions:write", "assessments:read", "stream:read"].map((s) => (
              <label key={s} className="flex items-center gap-1 text-xs">
                <input type="checkbox" name={s} defaultChecked /> {s}
              </label>
            ))}
            <label className="flex flex-col text-xs">
              Requests / min
              <input name="rpm" type="number" min={1} max={10000} defaultValue={120} className={`${input} w-24`} />
            </label>
            <button type="submit" className="rounded bg-primary px-3 py-1 text-sm text-primary-foreground">
              Create key
            </button>
          </form>
          <table className="text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="p-1">System</th>
                <th className="p-1">Key prefix</th>
                <th className="p-1">Scopes</th>
                <th className="p-1">Limit</th>
                <th className="p-1" />
              </tr>
            </thead>
            <tbody>
              {clients.map((c) => (
                <tr key={c.id} className={`border-t border-border ${c.isActive ? "" : "text-muted-foreground line-through"}`}>
                  <td className="p-1">{c.name}</td>
                  <td className="p-1 font-mono">{c.keyPrefix}</td>
                  <td className="p-1 text-xs">{c.scopes.join(", ")}</td>
                  <td className="p-1">{c.rateLimitPerMin}/min</td>
                  <td className="p-1">
                    {c.isActive && (
                      <button type="button" className="underline" onClick={() => revoke(c.id)}>
                        Revoke
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {tab === "configs" && (
        <section className="flex flex-col gap-3">
          <table className="text-sm" data-testid="configs">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="p-1">Version</th>
                <th className="p-1">Status</th>
                <th className="p-1">Notes</th>
                <th className="p-1">Created</th>
                <th className="p-1">Simulation (rules only)</th>
                <th className="p-1" />
              </tr>
            </thead>
            <tbody>
              {configs.map((c) => {
                const s = sims[c.id];
                return (
                  <tr key={c.id} className="border-t border-border align-top">
                    <td className="p-1 font-mono">v{c.version}</td>
                    <td className="p-1">{c.isActive ? <strong>active</strong> : "inactive"}</td>
                    <td className="p-1 text-xs">{c.notes ?? "–"}</td>
                    <td className="p-1 text-xs">{new Date(c.createdAt).toLocaleString()}</td>
                    <td className="p-1 text-xs">
                      {s ? (
                        <div className="flex flex-col gap-1">
                          <span>
                            {s.scenarios} scenarios · band accuracy {pct(s.bandAccuracy)} · suicide recall {pct(s.recallSuicidal)} · danger recall {pct(s.recallDanger)}
                          </span>
                          <table className="text-[11px]">
                            <thead>
                              <tr>
                                <th className="pr-2 text-left">expected ↓ / got →</th>
                                {BANDS.map((b) => (
                                  <th key={b} className="pr-2">
                                    {b[0]}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {s.confusionMatrix.map((row, i) => (
                                <tr key={BANDS[i]}>
                                  <td className="pr-2">{lower(BANDS[i]!)}</td>
                                  {row.map((n, j) => (
                                    <td key={j} className={`pr-2 text-center tabular-nums ${i === j ? "font-bold" : ""}`}>
                                      {n}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <button type="button" className="underline" onClick={() => simulate(c.id)}>
                          Simulate
                        </button>
                      )}
                    </td>
                    <td className="p-1">
                      {!c.isActive && (
                        <button type="button" className="rounded border border-border px-2" onClick={() => activate(c)}>
                          Activate
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {!configs.length && (
                <tr>
                  <td colSpan={6} className="p-1 text-muted-foreground">
                    No stored versions: the built-in default is in use. Run the seed to store it.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          {draft ? (
            <div className="flex flex-col gap-2">
              <label htmlFor="cfg" className="text-sm font-semibold">
                New version (weights must sum to 1; thresholds must increase)
              </label>
              <textarea id="cfg" value={draft} onChange={(e) => setDraft(e.target.value)} rows={20} className="rounded border border-border bg-background p-2 font-mono text-xs" />
              <div className="flex gap-2">
                <button type="button" onClick={saveDraft} className="rounded bg-primary px-3 py-1 text-sm text-primary-foreground">
                  Save as new version
                </button>
                <button type="button" onClick={() => setDraft("")} className="underline">
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={startDraft} disabled={!configs.length} className="self-start rounded border border-border px-3 py-1 text-sm disabled:opacity-60">
              New version from the active one
            </button>
          )}
        </section>
      )}
    </div>
  );
}
