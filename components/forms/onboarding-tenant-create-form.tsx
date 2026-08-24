"use client";

import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { Building2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { tenantOnboardingCreateSchema } from "@/features/onboarding/schemas";
import { apiFetch } from "@/lib/utils/client-api";

type Values = z.infer<typeof tenantOnboardingCreateSchema>;

export function OnboardingTenantCreateForm() {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(tenantOnboardingCreateSchema),
    defaultValues: {
      tenantName: "",
      tenantSlug: "",
      clientAdminName: "",
      clientAdminEmail: "",
      temporaryPassword: "",
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      const result = await apiFetch<{ tenant: { id: string; name: string } }>(
        "/api/onboarding/tenant",
        { method: "POST", body: JSON.stringify(values) },
      );
      await apiFetch("/api/auth/tenant", {
        method: "POST",
        body: JSON.stringify({ tenantId: result.tenant.id }),
      });
      toast.success(`${result.tenant.name} created in review-only mode.`);
      router.push("/onboarding");
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to create client.",
      );
    }
  });

  const fields: Array<{
    key: keyof Values;
    label: string;
    type?: string;
    placeholder: string;
  }> = [
    {
      key: "tenantName",
      label: "Client company",
      placeholder: "Northstar Heating",
    },
    {
      key: "tenantSlug",
      label: "Workspace slug",
      placeholder: "northstar-heating",
    },
    {
      key: "clientAdminName",
      label: "Client administrator",
      placeholder: "Taylor Morgan",
    },
    {
      key: "clientAdminEmail",
      label: "Administrator email",
      type: "email",
      placeholder: "taylor@example.com",
    },
    {
      key: "temporaryPassword",
      label: "Temporary password",
      type: "password",
      placeholder: "12+ characters",
    },
  ];

  return (
    <form className="grid gap-4 md:grid-cols-2" onSubmit={onSubmit}>
      {fields.map((field) => (
        <div className="space-y-2" key={field.key}>
          <Label htmlFor={`tenant-${field.key}`}>{field.label}</Label>
          <Input
            id={`tenant-${field.key}`}
            type={field.type}
            placeholder={field.placeholder}
            autoComplete={
              field.key === "temporaryPassword" ? "new-password" : undefined
            }
            {...register(field.key)}
          />
          {errors[field.key] ? (
            <p className="text-xs text-destructive">
              {errors[field.key]?.message}
            </p>
          ) : null}
        </div>
      ))}
      <div className="flex items-end md:col-span-2">
        <Button type="submit" disabled={isSubmitting}>
          <Building2 className="h-4 w-4" aria-hidden="true" />
          {isSubmitting ? "Creating workspace..." : "Create client workspace"}
        </Button>
      </div>
    </form>
  );
}
