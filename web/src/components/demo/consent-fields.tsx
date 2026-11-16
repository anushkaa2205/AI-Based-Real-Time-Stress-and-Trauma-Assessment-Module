"use client";

/**
 * Step 1 of every demo page (NIVARA_FLOW_AND_UI_PLAN.md §6.3): the consent an NHAA system would
 * have collected in its own workflow (PRODUCT_VISION.md §3), the language, and the district the
 * case belongs to (plan §8.4), so district, police and welfare portals receive it.
 */
import type { VictimLang } from "@/contracts/interaction";

export interface DemoConsent {
  textAnalysis: boolean;
  voiceAnalysis: boolean;
  shareWithCounsellor: boolean;
  followUpContact: boolean;
}

export const FULL_CONSENT: DemoConsent = { textAnalysis: true, voiceAnalysis: true, shareWithCounsellor: true, followUpContact: false };

export const LANGUAGE_LABEL: Record<VictimLang, string> = { en: "English", hi: "हिन्दी · Hindi", mr: "मराठी · Marathi", ta: "தமிழ் · Tamil", bn: "বাংলা · Bengali" };

export interface DistrictOption {
  code: string;
  name: string;
  state: string;
}

const FIELDS: { key: keyof DemoConsent; label: string; hint: string }[] = [
  { key: "textAnalysis", label: "Text analysis", hint: "The AI may read the messages. Without it only the safety rules run." },
  { key: "voiceAnalysis", label: "Voice analysis", hint: "Needed for audio." },
  { key: "shareWithCounsellor", label: "Share with a counsellor", hint: "Lets staff read the transcript and the evidence." },
  { key: "followUpContact", label: "Follow-up contact", hint: "Staff may plan a follow-up." },
];

export function ConsentFields({ value, onChange, disabled, need }: { value: DemoConsent; onChange: (v: DemoConsent) => void; disabled?: boolean; need?: keyof DemoConsent }) {
  return (
    <fieldset className="flex flex-col gap-2" disabled={disabled}>
      <legend className="label">Consent the NHAA system collected</legend>
      {FIELDS.map((f) => (
        <label key={f.key} className="flex cursor-pointer items-start gap-3 rounded-lg border border-line px-3 py-2.5 text-sm has-[:checked]:border-brand has-[:checked]:bg-brand-soft/40">
          <input type="checkbox" className="mt-0.5 size-4 accent-brand" checked={value[f.key]} onChange={(e) => onChange({ ...value, [f.key]: e.target.checked })} />
          <span>
            <span className="font-medium text-ink">{f.label}</span>
            <span className="block text-xs text-ink-3">{f.hint}</span>
            {need === f.key && !value[f.key] && <span className="block text-xs font-semibold text-warn">Audio is refused without this.</span>}
          </span>
        </label>
      ))}
    </fieldset>
  );
}

export function LanguageSelect({ value, onChange, disabled, id = "language" }: { value: VictimLang; onChange: (v: VictimLang) => void; disabled?: boolean; id?: string }) {
  return (
    <label htmlFor={id} className="flex flex-col">
      <span className="label">Language</span>
      <select id={id} className="field" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value as VictimLang)}>
        {(Object.keys(LANGUAGE_LABEL) as VictimLang[]).map((l) => (
          <option key={l} value={l}>
            {LANGUAGE_LABEL[l]}
          </option>
        ))}
      </select>
    </label>
  );
}

export function DistrictSelect({ districts, value, onChange, disabled }: { districts: DistrictOption[]; value: string; onChange: (v: string) => void; disabled?: boolean }) {
  return (
    <label htmlFor="district" className="flex flex-col">
      <span className="label">District</span>
      <select id="district" className="field" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
        {districts.map((d) => (
          <option key={d.code} value={d.code}>
            {d.name}, {d.state}
          </option>
        ))}
      </select>
      <span className="hint mt-1">Decides which district, police and welfare teams receive the case.</span>
    </label>
  );
}

/** The request body part the integration API expects (ConsentRequest). */
export function consentRequest(c: DemoConsent, language: string) {
  return { noticeVersion: "2026-11-v1", language, ...c, audioRetention: false };
}

export const DEFAULT_DISTRICT = "MH-PUN";
