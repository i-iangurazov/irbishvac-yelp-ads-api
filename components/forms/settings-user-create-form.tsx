"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { UserPlus } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { userCreateSchema } from "@/features/settings/schemas";
import { apiFetch } from "@/lib/utils/client-api";
import { roleLabels, type ProductionRoleCode } from "@/features/settings/roles";

type SettingsUserCreateValues = z.infer<typeof userCreateSchema>;

export function SettingsUserCreateForm({
  assignableRoles,
}: {
  assignableRoles: readonly ProductionRoleCode[];
}) {
  const router = useRouter();
  const {
    register,
    setValue,
    watch,
    reset,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SettingsUserCreateValues>({
    resolver: zodResolver(userCreateSchema),
    defaultValues: {
      name: "",
      email: "",
      roleCode: assignableRoles[0] ?? "VIEWER",
      password: "",
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      await apiFetch("/api/settings/users", {
        method: "POST",
        body: JSON.stringify(values),
      });

      toast.success("User created.");
      reset({
        name: "",
        email: "",
        roleCode: assignableRoles[0] ?? "VIEWER",
        password: "",
      });
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to create user.",
      );
    }
  });

  return (
    <form
      className="grid gap-4 border-b border-border p-4 md:grid-cols-[1fr_1fr_180px] xl:grid-cols-[1fr_1fr_180px_1fr_auto]"
      onSubmit={onSubmit}
    >
      <div className="space-y-2">
        <Label htmlFor="new-user-name">Name</Label>
        <Input
          id="new-user-name"
          placeholder="Jane Operator"
          {...register("name")}
        />
        {errors.name ? (
          <p className="text-xs text-destructive">{errors.name.message}</p>
        ) : null}
      </div>
      <div className="space-y-2">
        <Label htmlFor="new-user-email">Email</Label>
        <Input
          id="new-user-email"
          type="email"
          placeholder="jane@example.com"
          {...register("email")}
        />
        {errors.email ? (
          <p className="text-xs text-destructive">{errors.email.message}</p>
        ) : null}
      </div>
      <div className="space-y-2">
        <Label>Role</Label>
        <Select
          value={watch("roleCode")}
          onValueChange={(value) =>
            setValue("roleCode", value as SettingsUserCreateValues["roleCode"])
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {assignableRoles.map((roleCode) => (
              <SelectItem key={roleCode} value={roleCode}>
                {roleLabels[roleCode]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="new-user-password">Temporary password</Label>
        <Input
          id="new-user-password"
          type="password"
          autoComplete="new-password"
          placeholder="12+ characters"
          {...register("password")}
        />
        {errors.password ? (
          <p className="text-xs text-destructive">{errors.password.message}</p>
        ) : null}
      </div>
      <div className="flex items-end">
        <Button type="submit" disabled={isSubmitting}>
          <UserPlus className="h-4 w-4" />
          {isSubmitting ? "Creating..." : "Create user"}
        </Button>
      </div>
    </form>
  );
}
