"use client";

/**
 * System admin console (task 8.6, FR-SVI-06, API_CONTRACTS §5.9): staff users, API clients and
 * scoring configuration versions (create from the active one, simulate on the evaluation set,
 * activate). One-time secrets (temporary password, TOTP link, API key) are shown once here
 * and never again.
 */
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { API_SCOPES } from "@/models/enums";
import { DemoMark } from "./demo-mark";
import { useEnumLabel } from "./use-labels";

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
  isDemo?: boolean;
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
const pct = (x: number | null) => (x === null ? "–" : `${Math.round(x * 100)}%`);

async function call<T>(method: string, url: string, body?: unknown): Promise<{ ok: boolean; data: T & { detail?: string; title?: string } }> {
  const res = await fetch(url, { method, headers: body ? { "content-type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined, cache: "no-store" }).catch(() => null);
  const data = (res && res.status !== 204 ? await res.json().catch(() => ({})) : {}) as T & { detail?: string; title?: string };
  return { ok: !!res?.ok, data };
}

function Secret({ label, value }: { label: string; value: string }) {
  const t = useTranslations("staff.admin");
  return (
    <p className="rounded-lg border border-warn/40 bg-warn-soft px-3 py-2 text-sm text-warn" data-testid="one-time-secret">
      <strong>{t("shownOnce", { label })}</strong> <code className="break-all">{value}</code>
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
  const t = useTranslations("staff.admin");
  const e = useEnumLabel();

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

  const say = (ok: boolean, data: { detail?: string; title?: string }, success: string) => setMsg(ok ? success : (data.detail ?? data.title ?? t("failed")));
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
    say(r.ok, r.data, t("userCreated"));
    if (r.ok) {
      setSecrets([{ label: t("tempPassword"), value: r.data.temporaryPassword }, ...(r.data.totpUri ? [{ label: t("totpLink"), value: r.data.totpUri }] : [])]);
      form.reset();
      void load();
    }
  }

  async function patchUser(id: string, body: Record<string, unknown>, success: string) {
    const r = await call<{ temporaryPassword: string | null }>("PATCH", `/api/v1/staff/admin/users/${id}`, body);
    say(r.ok, r.data, success);
    if (r.ok && r.data.temporaryPassword) setSecrets([{ label: t("newTempPassword"), value: r.data.temporaryPassword }]);
    void load();
  }

  async function createClient(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const scopes = API_SCOPES.filter((s) => f.get(s));
    const r = await call<{ key: string }>("POST", "/api/v1/staff/admin/api-clients", { name: f.get("name"), scopes, rateLimitPerMin: Number(f.get("rpm") || 120), isDemo: f.get("isDemo") === "on" });
    say(r.ok, r.data, t("clientCreated"));
    if (r.ok) {
      setSecrets([{ label: t("apiKey"), value: r.data.key }]);
      form.reset();
      void load();
    }
  }

  async function revoke(id: string) {
    if (!confirm(t("revokeConfirm"))) return;
    const r = await call("DELETE", `/api/v1/staff/admin/api-clients/${id}`);
    say(r.ok, r.data, t("keyRevoked"));
    void load();
  }

  function startDraft() {
    const active = configs.find((c) => c.isActive) ?? configs[0];
    if (!active) return;
    const cfg = { ...active.config };
    delete cfg.version;
    delete cfg.isActive;
    delete cfg.notes;
    setDraft(JSON.stringify({ ...cfg, notes: t("basedOn", { v: active.version }) }, null, 2));
  }

  async function saveDraft() {
    let body: unknown;
    try {
      body = JSON.parse(draft);
    } catch {
      setMsg(t("invalidJson"));
      return;
    }
    const r = await call<{ version: number }>("POST", "/api/v1/staff/admin/scoring-configs", body);
    say(r.ok, r.data, t("savedVersion", { v: r.data.version }));
    if (r.ok) {
      setDraft("");
      void load();
    }
  }

  async function simulate(id: string) {
    setMsg(t("running"));
    const r = await call<Sim>("POST", `/api/v1/staff/admin/scoring-configs/${id}/simulate`);
    say(r.ok, r.data, t("simDone"));
    if (r.ok) setSims((s) => ({ ...s, [id]: r.data }));
  }

  async function activate(c: ConfigRow) {
    if (!confirm(t("activateConfirm", { v: c.version }))) return;
    const r = await call<{ version: number; rescoring: number }>("POST", `/api/v1/staff/admin/scoring-configs/${c.id}/activate`);
    say(r.ok, r.data, t("activated", { v: r.data.version, n: r.data.rescoring }));
    void load();
  }

  const tabBtn = (k: typeof tab, label: string) => (
    <button type="button" onClick={() => setTab(k)} className={`-mb-px border-b-[3px] px-3 py-2 text-sm font-semibold ${tab === k ? "border-brand text-brand" : "border-transparent text-ink-2 hover:text-ink"}`} aria-pressed={tab === k}>
      {label}
    </button>
  );
  const input = "field w-auto min-w-28";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2" role="group" aria-label={t("sections")}>
        {tabBtn("users", t("tabUsers"))}
        {tabBtn("clients", t("tabClients"))}
        {tabBtn("configs", t("tabConfigs"))}
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
          <form onSubmit={createUser} className="flex flex-wrap items-end gap-2 card p-3" data-testid="user-form">
            <label className="flex flex-col text-xs">
              {t("name")}
              <input name="name" required minLength={2} className={input} />
            </label>
            <label className="flex flex-col text-xs">
              {t("email")}
              <input name="email" type="email" required className={input} />
            </label>
            <label className="flex flex-col text-xs">
              {t("role")}
              <select name="role" className={input}>
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {e("roles", r)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col text-xs">
              {t("districtField")}
              <select name="districtId" className={input}>
                <option value="">–</option>
                {districts.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className="btn btn-primary">
              {t("createUser")}
            </button>
          </form>
          <table className="text-sm" data-testid="users">
            <thead>
              <tr className="text-left text-xs text-ink-3">
                <th className="p-1">{t("name")}</th>
                <th className="p-1">{t("email")}</th>
                <th className="p-1">{t("role")}</th>
                <th className="p-1">{t("district")}</th>
                <th className="p-1">{t("lastSignIn")}</th>
                <th className="p-1" />
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className={`border-t border-border ${u.isActive ? "" : "text-ink-3 line-through"}`}>
                  <td className="p-1">{u.name}</td>
                  <td className="p-1">{u.email}</td>
                  <td className="p-1">{e("roles", u.role)}</td>
                  <td className="p-1">{districtName(u.districtId)}</td>
                  <td className="p-1">{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : t("never")}</td>
                  <td className="flex gap-2 p-1">
                    <button type="button" className="link" onClick={() => patchUser(u.id, { isActive: !u.isActive }, u.isActive ? t("deactivated") : t("reactivated"))}>
                      {u.isActive ? t("deactivate") : t("reactivate")}
                    </button>
                    <button type="button" className="link" onClick={() => patchUser(u.id, { resetPassword: true }, t("passwordReset"))}>
                      {t("resetPassword")}
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
          <form onSubmit={createClient} className="flex flex-wrap items-end gap-3 card p-3">
            <label className="flex flex-col text-xs">
              {t("systemName")}
              <input name="name" required minLength={2} className={input} />
            </label>
            {API_SCOPES.map((s) => (
              <label key={s} className="flex items-center gap-1 text-xs">
                <input type="checkbox" name={s} defaultChecked={s !== "indicators:read"} /> {s}
              </label>
            ))}
            <label className="flex flex-col text-xs">
              {t("rpm")}
              <input name="rpm" type="number" min={1} max={10000} defaultValue={120} className={`${input} w-24`} />
            </label>
            <label className="flex items-center gap-1 text-xs" title={t("demoTitle")}>
              <input type="checkbox" name="isDemo" /> {t("demoLayer")}
            </label>
            <button type="submit" className="btn btn-primary">
              {t("createKey")}
            </button>
          </form>
          <table className="text-sm">
            <thead>
              <tr className="text-left text-xs text-ink-3">
                <th className="p-1">{t("system")}</th>
                <th className="p-1">{t("keyPrefix")}</th>
                <th className="p-1">{t("scopes")}</th>
                <th className="p-1">{t("limit")}</th>
                <th className="p-1" />
              </tr>
            </thead>
            <tbody>
              {clients.map((c) => (
                <tr key={c.id} className={`border-t border-border ${c.isActive ? "" : "text-ink-3 line-through"}`}>
                  <td className="p-1">
                    {c.name} <DemoMark show={c.isDemo} />
                  </td>
                  <td className="p-1 num">{c.keyPrefix}</td>
                  <td className="p-1 text-xs">{c.scopes.join(", ")}</td>
                  <td className="p-1">{t("perMin", { n: c.rateLimitPerMin })}</td>
                  <td className="p-1">
                    {c.isActive && (
                      <button type="button" className="link" onClick={() => revoke(c.id)}>
                        {t("revoke")}
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
              <tr className="text-left text-xs text-ink-3">
                <th className="p-1">{t("version")}</th>
                <th className="p-1">{t("status")}</th>
                <th className="p-1">{t("notes")}</th>
                <th className="p-1">{t("created")}</th>
                <th className="p-1">{t("simulation")}</th>
                <th className="p-1" />
              </tr>
            </thead>
            <tbody>
              {configs.map((c) => {
                const s = sims[c.id];
                return (
                  <tr key={c.id} className="border-t border-border align-top">
                    <td className="p-1 num">v{c.version}</td>
                    <td className="p-1">{c.isActive ? <strong>{t("active")}</strong> : t("inactive")}</td>
                    <td className="p-1 text-xs">{c.notes ?? "–"}</td>
                    <td className="p-1 text-xs">{new Date(c.createdAt).toLocaleString()}</td>
                    <td className="p-1 text-xs">
                      {s ? (
                        <div className="flex flex-col gap-1">
                          <span>
                            {t("simSummary", { n: s.scenarios, acc: pct(s.bandAccuracy), s: pct(s.recallSuicidal), d: pct(s.recallDanger) })}
                          </span>
                          <table className="text-[11px]">
                            <thead>
                              <tr>
                                <th className="pr-2 text-left">{t("matrixHead")}</th>
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
                                  <td className="pr-2">{e("bands", BANDS[i]!)}</td>
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
                        <button type="button" className="link" onClick={() => simulate(c.id)}>
                          {t("simulate")}
                        </button>
                      )}
                    </td>
                    <td className="p-1">
                      {!c.isActive && (
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => activate(c)}>
                          {t("activate")}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {!configs.length && (
                <tr>
                  <td colSpan={6} className="p-1 text-ink-3">
                    {t("noVersions")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          {draft ? (
            <div className="flex flex-col gap-2">
              <label htmlFor="cfg" className="text-sm font-semibold">
                {t("newVersionLabel")}
              </label>
              <textarea id="cfg" value={draft} onChange={(e) => setDraft(e.target.value)} rows={20} className="rounded-lg border border-line bg-surface-2 p-2 num text-xs" />
              <div className="flex gap-2">
                <button type="button" onClick={saveDraft} className="btn btn-primary">
                  {t("saveVersion")}
                </button>
                <button type="button" onClick={() => setDraft("")} className="link">
                  {t("cancel")}
                </button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={startDraft} disabled={!configs.length} className="btn btn-secondary self-start">
              {t("newFromActive")}
            </button>
          )}
        </section>
      )}
    </div>
  );
}
