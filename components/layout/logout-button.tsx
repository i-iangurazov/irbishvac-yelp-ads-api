"use client";

import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/utils/client-api";

export function LogoutButton() {
  const router = useRouter();

  return (
    <Button
      variant="outline"
      onClick={async () => {
        await apiFetch("/api/auth/logout", {
          method: "POST"
        });
        router.push("/login");
        router.refresh();
      }}
    >
      Sign out
    </Button>
  );
}
