"use client";

/**
 * Display labels for enum values on staff screens, in the site language (task P.8, FR-LANG-07).
 * Enum values in data are never translated; only how they are shown. Unknown values fall back to
 * a readable form of the raw value, so a new enum value never breaks a screen.
 */
import { useTranslations } from "next-intl";

export type EnumGroup = "dimensions" | "sources" | "indicatorStatus" | "support" | "urgency" | "recStatus" | "interactionStatus" | "referralStatus" | "senders" | "review";

export const words = (v: string) => v.replace(/_/g, " ").toLowerCase();

export function useEnumLabel(): (group: EnumGroup | "bands" | "channels" | "status" | "roles", value: string) => string {
  const t = useTranslations("staff");
  return (group, value) => {
    const key = ["bands", "channels", "status", "roles"].includes(group) ? `${group}.${value}` : `enums.${group}.${value}`;
    return t.has(key) ? t(key) : words(value);
  };
}
