"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";

export function SignOutButton() {
  const router = useRouter();
  const t = useTranslations("staff.shell");
  return (
    <button
      type="button"
      className="btn btn-sm btn-ghost-light w-full"
      onClick={async () => {
        await fetch("/api/v1/staff/auth/logout", { method: "POST" });
        router.replace("/login");
      }}
    >
      {t("signOut")}
    </button>
  );
}
