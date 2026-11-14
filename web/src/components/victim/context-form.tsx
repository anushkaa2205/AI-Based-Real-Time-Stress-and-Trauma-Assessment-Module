"use client";

/** Optional situation questions (FR-CH-08). Every field can be left blank. No caste or community field (rule 10). */
import { useTranslations } from "next-intl";
import type { FormEvent } from "react";

const BOOLS = ["supportPersonPresent", "ongoingThreats", "pressureToWithdraw", "displaced", "hasDisability", "familyMemberKilled"] as const;
const OFFENCES = ["THREAT_INTIMIDATION", "PHYSICAL_ATTACK", "SEXUAL_VIOLENCE", "SOCIAL_BOYCOTT", "PROPERTY_DAMAGE", "OTHER"] as const;
const AGES = ["UNDER_18", "18_59", "60_PLUS"] as const;
const GENDERS = ["F", "M", "OTHER", "UNDISCLOSED"] as const;

const selectClass = "min-h-12 w-full rounded-md border border-input bg-background px-3 text-lg";

export function ContextForm({ onSubmit, busy }: { onSubmit: (ctx: Record<string, unknown>) => void; busy: boolean }) {
  const t = useTranslations("flow.context");
  const tc = useTranslations("common");

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const ctx: Record<string, unknown> = {};
    for (const k of ["offenceCategory", "ageGroup", "gender"]) {
      const v = f.get(k);
      if (typeof v === "string" && v) ctx[k] = v;
    }
    for (const k of BOOLS) {
      const v = f.get(k);
      if (v === "yes") ctx[k] = true;
      if (v === "no") ctx[k] = false;
    }
    onSubmit(ctx);
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1">
        <span className="font-medium">{t("offenceCategory")}</span>
        <select name="offenceCategory" className={selectClass} defaultValue="">
          <option value="">—</option>
          {OFFENCES.map((o) => (
            <option key={o} value={o}>
              {t(`offence.${o}`)}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="font-medium">{t("ageGroup")}</span>
        <select name="ageGroup" className={selectClass} defaultValue="">
          <option value="">—</option>
          {AGES.map((a) => (
            <option key={a} value={a}>
              {t(`age.${a}`)}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="font-medium">{t("gender")}</span>
        <select name="gender" className={selectClass} defaultValue="">
          <option value="">—</option>
          {GENDERS.map((g) => (
            <option key={g} value={g}>
              {t(`genderOption.${g}`)}
            </option>
          ))}
        </select>
      </label>
      {BOOLS.map((k) => (
        <fieldset key={k} className="flex flex-col gap-2">
          <legend className="font-medium">{t(k)}</legend>
          <div className="flex gap-3">
            {(["yes", "no"] as const).map((v) => (
              <label key={v} className="flex min-h-12 flex-1 items-center gap-2 rounded-md border border-border px-3">
                <input type="radio" name={k} value={v} className="size-5" />
                {tc(v)}
              </label>
            ))}
          </div>
        </fieldset>
      ))}
      <button type="submit" disabled={busy} className="min-h-14 rounded-lg bg-primary text-xl font-semibold text-primary-foreground disabled:opacity-60">
        {t("submit")}
      </button>
      <button type="button" disabled={busy} onClick={() => onSubmit({})} className="min-h-12 rounded-lg border border-border text-lg">
        {t("skipAll")}
      </button>
    </form>
  );
}
