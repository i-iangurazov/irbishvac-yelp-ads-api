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
  leadAutomationRenderModeOptions,
  leadAutomationStarterTemplates,
  leadAutomationTemplateKinds
} from "@/features/autoresponder/constants";
import {
  leadAutomationTemplateFormSchema,
  type LeadAutomationTemplateFormValues
} from "@/features/autoresponder/schemas";
import { humanizeLeadAutomationTemplateKind } from "@/features/autoresponder/template-metadata";
import { apiFetch } from "@/lib/utils/client-api";

const variableExamples = [
  "{{customer_name}}",
  "{{business_name}}",
  "{{location_name}}",
  "{{service_type}}",
  "{{lead_reference}}"
] as const;

export function LeadAutomationTemplateForm({
  initialValues,
  templateId,
  businesses,
  canDelete = false,
  returnPath = "/autoresponder" as Route
}: {
  initialValues?: Partial<LeadAutomationTemplateFormValues> | null;
  templateId?: string | null;
  businesses: Array<{ id: string; name: string; yelpBusinessId: string | null }>;
  canDelete?: boolean;
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
      renderMode: initialValues?.renderMode ?? "STATIC",
      aiPrompt: initialValues?.aiPrompt ?? "",
      isEnabled: initialValues?.isEnabled ?? true,
      subjectTemplate: initialValues?.subjectTemplate ?? "",
      bodyTemplate: initialValues?.bodyTemplate ?? ""
    }
  });
  const templateKind = watch("templateKind");
  const renderMode = watch("renderMode");

  const loadStarterCopy = () => {
    if (templateKind === "CUSTOM") {
      return;
    }

    const starter = leadAutomationStarterTemplates[templateKind];
    setValue("name", starter.name, { shouldValidate: true });
    setValue("subjectTemplate", starter.subject, { shouldValidate: true });
    setValue("bodyTemplate", starter.body, { shouldValidate: true });
    setValue("aiPrompt", starter.aiPrompt ?? "", { shouldValidate: true });
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

  const removeTemplate = async () => {
    if (!canDelete || !templateId) {
      return;
    }

    const confirmed = window.confirm(
      "Delete this template? Any rules that still depend on it will also be removed."
    );

    if (!confirmed) {
      return;
    }

    try {
      await apiFetch(`/api/settings/autoresponder/templates/${templateId}`, {
        method: "DELETE"
      });
      toast.success("Automation template deleted.");
      router.replace(returnPath);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to delete automation template.");
    }
  };

  return (
    <Card className="shadow-none">
      <CardHeader className="pb-3">
        <CardTitle>{isEditing ? "Edit template" : "New template"}</CardTitle>
        <CardDescription>Rules choose the template. The template can stay static or guide a guarded AI reply with fallback.</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-5" onSubmit={submit}>
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
                      {humanizeLeadAutomationTemplateKind(kind)}
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

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Render mode</Label>
              <Select
                value={renderMode}
                onValueChange={(value) =>
                  setValue("renderMode", value as LeadAutomationTemplateFormValues["renderMode"], {
                    shouldValidate: true
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {leadAutomationRenderModeOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {leadAutomationRenderModeOptions.find((option) => option.value === renderMode)?.description ??
                  "Choose how this template renders."}
              </p>
            </div>
            <div className="rounded-xl border border-border/80 bg-muted/10 px-4 py-3 text-sm text-muted-foreground">
              {renderMode === "AI_ASSISTED"
                ? "AI follows the guidance below, then falls back to the saved message if output is risky or unavailable."
                : "Static mode sends the saved template message as written."}
            </div>
          </div>

          {renderMode === "AI_ASSISTED" ? (
            <div className="space-y-2">
              <Label htmlFor="automation-template-ai-prompt">AI guidance</Label>
              <Textarea
                id="automation-template-ai-prompt"
                placeholder="Write a short Yelp-thread reply that acknowledges the request, asks for the most useful missing detail, avoids estimates or promises, and keeps the next step inside Yelp."
                rows={6}
                {...register("aiPrompt")}
              />
              {errors.aiPrompt ? (
                <p className="text-sm text-destructive">{errors.aiPrompt.message}</p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Tell AI how to respond. Disclosure, risk checks, and fallback still apply automatically.
                </p>
              )}
            </div>
          ) : null}

          {watch("channel") === "EMAIL" ? (
            <div className="space-y-2">
              <Label htmlFor="automation-template-subject">
                {renderMode === "AI_ASSISTED" ? "Fallback email subject" : "Email subject"}
              </Label>
              <Input id="automation-template-subject" placeholder="Irbishvac automated message from {{business_name}} via Yelp" {...register("subjectTemplate")} />
              {errors.subjectTemplate ? (
                <p className="text-sm text-destructive">{errors.subjectTemplate.message}</p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Leave blank to use the default fallback subject.
                </p>
              )}
            </div>
          ) : (
            <div className="text-xs text-muted-foreground">
              Yelp thread templates do not use a subject.
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="automation-template-body">
              {renderMode === "AI_ASSISTED"
                ? watch("channel") === "EMAIL"
                  ? "Fallback email body"
                  : "Fallback Yelp thread message"
                : watch("channel") === "EMAIL"
                  ? "Email body"
                  : "Yelp thread message"}
            </Label>
            <Textarea
              id="automation-template-body"
              placeholder={"Irbishvac automated message from {{business_name}} via Yelp - a team member may follow up with more details.\n\nHi {{customer_name}}, thanks for reaching out about {{service_type}}. Please reply here with any photos, the address, and a short description so we can review the next step."}
              rows={8}
              {...register("bodyTemplate")}
            />
            {errors.bodyTemplate ? (
              <p className="text-sm text-destructive">{errors.bodyTemplate.message}</p>
            ) : renderMode === "AI_ASSISTED" ? (
              <p className="text-xs text-muted-foreground">
                Used if AI output fails, violates guardrails, or is disabled for this scope.
              </p>
            ) : null}
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
            {canDelete ? (
              <Button onClick={removeTemplate} type="button" variant="destructive">
                Delete template
              </Button>
            ) : null}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
