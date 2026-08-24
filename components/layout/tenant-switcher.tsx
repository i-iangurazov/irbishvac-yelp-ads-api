"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiFetch } from "@/lib/utils/client-api";

export function TenantSwitcher({
  activeTenantId,
  tenants,
}: {
  activeTenantId: string;
  tenants: Array<{ id: string; name: string; slug: string }>;
}) {
  const router = useRouter();
  const [isSwitching, setIsSwitching] = useState(false);

  return (
    <Select
      value={activeTenantId}
      disabled={isSwitching}
      onValueChange={async (tenantId) => {
        if (tenantId === activeTenantId) {
          return;
        }

        setIsSwitching(true);
        try {
          await apiFetch("/api/auth/tenant", {
            method: "POST",
            body: JSON.stringify({ tenantId }),
          });
          router.push("/onboarding");
          router.refresh();
        } catch (error) {
          toast.error(
            error instanceof Error
              ? error.message
              : "Unable to switch client workspace.",
          );
          setIsSwitching(false);
        }
      }}
    >
      <SelectTrigger
        className="h-10 min-w-56 max-w-full"
        aria-label="Active client workspace"
      >
        <SelectValue placeholder="Select workspace" />
      </SelectTrigger>
      <SelectContent>
        {tenants.map((tenant) => (
          <SelectItem key={tenant.id} value={tenant.id}>
            {tenant.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
