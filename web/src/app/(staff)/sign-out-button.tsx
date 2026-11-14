"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function SignOutButton() {
  const router = useRouter();
  return (
    <Button
      variant="outline"
      onClick={async () => {
        await fetch("/api/v1/staff/auth/logout", { method: "POST" });
        router.replace("/login");
      }}
    >
      Sign out
    </Button>
  );
}
