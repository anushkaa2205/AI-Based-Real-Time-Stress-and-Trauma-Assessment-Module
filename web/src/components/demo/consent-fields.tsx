"use client";

/**
 * The consent an NHAA system would have collected in its own workflow (PRODUCT_VISION.md §3) and
 * passes to the module on start. The demo lets the presenter set it, to show what each choice does.
 */
export interface DemoConsent {
  textAnalysis: boolean;
  voiceAnalysis: boolean;
  shareWithCounsellor: boolean;
  followUpContact: boolean;
}

export const FULL_CONSENT: DemoConsent = { textAnalysis: true, voiceAnalysis: true, shareWithCounsellor: true, followUpContact: false };

const FIELDS: { key: keyof DemoConsent; label: string; hint: string }[] = [
  { key: "textAnalysis", label: "Text analysis", hint: "AI reads the messages. Without it only the safety rules run." },
  { key: "voiceAnalysis", label: "Voice analysis", hint: "Needed for audio." },
  { key: "shareWithCounsellor", label: "Share with counsellor", hint: "Lets staff read the transcript and evidence." },
  { key: "followUpContact", label: "Follow-up contact", hint: "" },
];

export function ConsentFields({ value, onChange, disabled, need }: { value: DemoConsent; onChange: (v: DemoConsent) => void; disabled?: boolean; need?: keyof DemoConsent }) {
  return (
    <fieldset className="flex flex-col gap-1.5" disabled={disabled}>
      <legend className="mb-1 text-xs font-semibold text-ink-2">Consent collected by the NHAA system</legend>
      {FIELDS.map((f) => (
        <label key={f.key} className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-0.5 size-4 accent-[#1f3a5f]" checked={value[f.key]} onChange={(e) => onChange({ ...value, [f.key]: e.target.checked })} />
          <span>
            {f.label}
            {f.hint && <span className="block text-xs text-muted-foreground">{f.hint}</span>}
            {need === f.key && !value[f.key] && <span className="block text-xs font-semibold text-warn">Audio is refused without this.</span>}
          </span>
        </label>
      ))}
    </fieldset>
  );
}

/** The request body part the integration API expects (ConsentRequest). */
export function consentRequest(c: DemoConsent, language: string) {
  return { noticeVersion: "2026-11-v1", language, ...c, audioRetention: false };
}
