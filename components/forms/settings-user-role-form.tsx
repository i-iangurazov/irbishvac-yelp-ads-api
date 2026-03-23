"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { RoleCode } from "@prisma/client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiFetch } from "@/lib/utils/client-api";

export function SettingsUserRoleForm({
  userId,
  roleCode
}: {
  userId: string;
  roleCode: RoleCode;
}) {
  const router = useRouter();

  return (
    <Select
      defaultValue={roleCode}
      onValueChange={async (value) => {
        try {
          await apiFetch("/api/settings/users", {
            method: "PATCH",
            body: JSON.stringify({
              userId,
              roleCode: value
            })
          });
          toast.success("Role updated.");
          router.refresh();
        } catch (error) {
          toast.error(error instanceof Error ? error.message : "Unable to update role.");
        }
      }}
    >
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="ADMIN">Admin</SelectItem>
        <SelectItem value="OPERATOR">Operator</SelectItem>
        <SelectItem value="ANALYST">Analyst</SelectItem>
        <SelectItem value="VIEWER">Viewer</SelectItem>
      </SelectContent>
    </Select>
  );
}
