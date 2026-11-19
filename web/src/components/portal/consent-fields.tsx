"use client";

/**
 * Step 1, Before we begin (Phase P, plan §6.3): the consent an NHAA system would collect in its own
 * workflow (PRODUCT_VISION.md §3), worded calmly, and the district the case belongs to (plan §8.4),
 * so district, police and welfare portals receive it. Nothing is analysed before consent (rule 6).
 */
import { useTranslations } from "next-intl";

export interface PortalConsent {
  textAnalysis: boolean;
  voiceAnalysis: boolean;
  shareWithCounsellor: boolean;
  followUpContact: boolean;
}

export const FULL_CONSENT: PortalConsent = { textAnalysis: true, voiceAnalysis: true, shareWithCounsellor: true, followUpContact: false };

export interface DistrictOption {
  code: string;
  name: string;
  state: string;
}

const KEYS: (keyof PortalConsent)[] = ["textAnalysis", "voiceAnalysis", "shareWithCounsellor", "followUpContact"];

export function ConsentFields({ value, onChange, disabled }: { value: PortalConsent; onChange: (v: PortalConsent) => void; disabled?: boolean }) {
  const t = useTranslations("portal");
  return (
    <fieldset className="flex flex-col gap-2" disabled={disabled} data-testid="consent-fields">
      <legend className="label">{t("begin.consentTitle")}</legend>
      {KEYS.map((k) => (
        <label key={k} className="flex cursor-pointer items-start gap-3 rounded-lg border border-line px-3 py-2.5 text-sm has-[:checked]:border-brand has-[:checked]:bg-brand-soft/40">
          <input type="checkbox" name={k} className="mt-0.5 size-4 accent-brand" checked={value[k]} onChange={(e) => onChange({ ...value, [k]: e.target.checked })} />
          <span>
            <span className="font-medium text-ink">{t(`consent.${k}`)}</span>
            <span className="block text-xs leading-relaxed text-ink-2">{t(`consent.${k}Hint`)}</span>
          </span>
        </label>
      ))}
    </fieldset>
  );
}

export function DistrictSelect({ districts, value, onChange, disabled }: { districts: DistrictOption[]; value: string; onChange: (v: string) => void; disabled?: boolean }) {
  const t = useTranslations("portal.begin");
  return (
    <label htmlFor="district" className="flex flex-col">
      <span className="label">{t("district")}</span>
      <select id="district" className="field min-h-11" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} data-testid="district">
        {districts.map((d) => (
          <option key={d.code} value={d.code}>
            {d.name}, {d.state}
          </option>
        ))}
      </select>
      <span className="hint mt-1">{t("districtHint")}</span>
    </label>
  );
}

/** The request body part the integration API expects (ConsentRequest). */
export function consentRequest(c: PortalConsent, language: string) {
  return { noticeVersion: "2026-11-v1", language, ...c, audioRetention: false };
}

export const DEFAULT_DISTRICT = "MH-PUN";
