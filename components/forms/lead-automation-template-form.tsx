"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  leadAutomationStarterTemplates,
  leadAutomationTemplateKinds
} from "@/features/autoresponder/constants";
import {
  leadAutomationTemplateFormSchema,
  type LeadAutomationTemplateFormValues
} from "@/features/autoresponder/schemas";
import { apiFetch } from "@/lib/utils/client-api";

const variableExamples = [
  "{{customer_name}}",
  "{{business_name}}",
  "{{location_name}}",
  "{{service_type}}",
  "{{lead_reference}}"
] as const;

function humanizeTemplateKind(kind: LeadAutomationTemplateFormValues["templateKind"]) {
  return kind
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function LeadAutomationTemplateForm({
  initialValues,
  templateId,
  businesses,
  returnPath = "/autoresponder" as Route
}: {
  initialValues?: Partial<LeadAutomationTemplateFormValues> | null;
  templateId?: string | null;
  businesses: Array<{ id: string; name: string; yelpBusinessId: string | null }>;
  returnPath?: Route;
}) {
  const router = useRouter();
  const isEditing = Boolean(templateId);
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting }
  } = useForm<LeadAutomationTemplateFormValues>({
    resolver: zodResolver(leadAutomationTemplateFormSchema),
    defaultValues: {
      name: initialValues?.name ?? "",
      businessId: initialValues?.businessId ?? "",
      channel: initialValues?.channel ?? "YELP_THREAD",
      templateKind: initialValues?.templateKind ?? "ACKNOWLEDGMENT",
      isEnabled: initialValues?.isEnabled ?? true,
      subjectTemplate: initialValues?.subjectTemplate ?? "",
      bodyTemplate: initialValues?.bodyTemplate ?? ""
    }
  });
  const templateKind = watch("templateKind");

  const loadStarterCopy = () => {
    if (templateKind === "CUSTOM") {
      return;
    }

    const starter = leadAutomationStarterTemplates[templateKind];
    setValue("name", starter.name, { shouldValidate: true });
    setValue("subjectTemplate", starter.subject, { shouldValidate: true });
    setValue("bodyTemplate", starter.body, { shouldValidate: true });
  };

  const submit = handleSubmit(async (values) => {
    try {
      const url = isEditing ? `/api/settings/autoresponder/templates/${templateId}` : "/api/settings/autoresponder/templates";
      const method = isEditing ? "PATCH" : "POST";

      await apiFetch(url, {
        method,
        body: JSON.stringify(values)
      });

      toast.success(isEditing ? "Automation template updated." : "Automation template created.");
      router.replace(returnPath);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to save automation template.");
    }
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle>{isEditing ? "Edit template" : "New template"}</CardTitle>
        <CardDescription>Short, explicit copy for initial responses and follow-ups.</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={submit}>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="automation-template-name">Template name</Label>
              <Input id="automation-template-name" placeholder="Default first response" {...register("name")} />
              {errors.name ? <p className="text-sm text-destructive">{errors.name.message}</p> : null}
            </div>

            <div className="space-y-2">
              <Label>Business scope</Label>
              <Select value={watch("businessId") || "all"} onValueChange={(value) => setValue("businessId", value === "all" ? "" : value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All businesses</SelectItem>
                  {businesses.map((business) => (
                    <SelectItem key={business.id} value={business.id}>
                      {business.name}
                      {business.yelpBusinessId ? ` • ${business.yelpBusinessId}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
            <div className="space-y-2">
              <Label>Template type</Label>
              <Select value={templateKind} onValueChange={(value) => setValue("templateKind", value as LeadAutomationTemplateFormValues["templateKind"])}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {leadAutomationTemplateKinds.map((kind) => (
                    <SelectItem key={kind} value={kind}>
                      {humanizeTemplateKind(kind)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Delivery channel</Label>
              <Select value={watch("channel")} onValueChange={(value) => setValue("channel", value as "YELP_THREAD" | "EMAIL")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="YELP_THREAD">Yelp thread</SelectItem>
                  <SelectItem value="EMAIL">Yelp masked email fallback</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-end">
              <Button onClick={loadStarterCopy} type="button" variant="outline">
                Load starter
              </Button>
            </div>
          </div>

          {watch("channel") === "EMAIL" ? (
            <div className="space-y-2">
              <Label htmlFor="automation-template-subject">Email subject</Label>
              <Input id="automation-template-subject" placeholder="Automated message from {{business_name}} via Yelp" {...register("subjectTemplate")} />
              {errors.subjectTemplate ? <p className="text-sm text-destructive">{errors.subjectTemplate.message}</p> : <p className="text-xs text-muted-foreground">Leave blank to use the default fallback subject.</p>}
            </div>
          ) : (
            <div className="text-xs text-muted-foreground">Yelp thread templates do not use a subject.</div>
          )}

          <div className="space-y-2">
            <Label htmlFor="automation-template-body">{watch("channel") === "EMAIL" ? "Email body" : "Yelp thread message"}</Label>
            <Textarea
              id="automation-template-body"
              placeholder={"Automated message from {{business_name}} via Yelp - a team member may follow up with more details.\n\nHi {{customer_name}}, thanks for reaching out about {{service_type}}. Please reply here with any photos, the address, and a short description so we can review the next step."}
              rows={8}
              {...register("bodyTemplate")}
            />
            {errors.bodyTemplate ? <p className="text-sm text-destructive">{errors.bodyTemplate.message}</p> : null}
          </div>

          <div className="rounded-xl border border-border/80 bg-muted/10 px-4 py-3 text-xs text-muted-foreground">
            Variables: {variableExamples.join(", ")}
          </div>

          <div className="flex items-center justify-between rounded-xl border border-border/80 bg-muted/10 px-4 py-3">
            <div>
              <div className="text-sm font-medium">Enabled</div>
              <div className="text-xs text-muted-foreground">Disabled templates stay in history but are not chosen by live rules.</div>
            </div>
            <Switch checked={watch("isEnabled")} onCheckedChange={(checked) => setValue("isEnabled", checked)} />
          </div>

          <div className="flex gap-2">
            <Button disabled={isSubmitting} type="submit">
              {isSubmitting ? "Saving..." : isEditing ? "Save template" : "Create template"}
            </Button>
            {isEditing ? (
              <Button onClick={() => router.replace(returnPath)} type="button" variant="outline">
                Cancel
              </Button>
            ) : null}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
