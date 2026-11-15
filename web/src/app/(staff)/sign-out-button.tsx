"use client";

import { useRouter } from "next/navigation";

export function SignOutButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      className="btn btn-sm w-full border-white/30 bg-transparent text-white hover:bg-white/10"
      onClick={async () => {
        await fetch("/api/v1/staff/auth/logout", { method: "POST" });
        router.replace("/login");
      }}
    >
      Sign out
    </button>
  );
}
