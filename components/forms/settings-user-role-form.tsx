"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { RoleCode } from "@prisma/client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiFetch } from "@/lib/utils/client-api";
import { roleLabels, type ProductionRoleCode } from "@/features/settings/roles";

export function SettingsUserRoleForm({
  userId,
  roleCode,
  assignableRoles,
}: {
  userId: string;
  roleCode: RoleCode;
  assignableRoles: readonly ProductionRoleCode[];
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
              roleCode: value,
            }),
          });
          toast.success("Role updated.");
          router.refresh();
        } catch (error) {
          toast.error(
            error instanceof Error ? error.message : "Unable to update role.",
          );
        }
      }}
    >
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {assignableRoles.map((assignableRole) => (
          <SelectItem key={assignableRole} value={assignableRole}>
            {roleLabels[assignableRole]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
