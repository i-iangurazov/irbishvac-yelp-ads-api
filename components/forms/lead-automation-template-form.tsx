"use client";

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

export function LeadAutomationTemplateForm({
  initialValues,
  templateId
}: {
  initialValues?: Partial<LeadAutomationTemplateFormValues> | null;
  templateId?: string | null;
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
      channel: initialValues?.channel ?? "YELP_THREAD",
      isEnabled: initialValues?.isEnabled ?? true,
      subjectTemplate: initialValues?.subjectTemplate ?? "",
      bodyTemplate: initialValues?.bodyTemplate ?? ""
    }
  });

  const submit = handleSubmit(async (values) => {
    try {
      const url = isEditing ? `/api/settings/autoresponder/templates/${templateId}` : "/api/settings/autoresponder/templates";
      const method = isEditing ? "PATCH" : "POST";

      await apiFetch(url, {
        method,
        body: JSON.stringify(values)
      });

      toast.success(isEditing ? "Automation template updated." : "Automation template created.");
      router.replace("/settings");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to save automation template.");
    }
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{isEditing ? "Edit template" : "New template"}</CardTitle>
        <CardDescription>Use explicit variables only. The template body becomes either a Yelp thread message or an external email reply, depending on the selected channel.</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={submit}>
          <div className="space-y-2">
            <Label htmlFor="automation-template-name">Template name</Label>
            <Input id="automation-template-name" placeholder="Default first response" {...register("name")} />
            {errors.name ? <p className="text-sm text-destructive">{errors.name.message}</p> : null}
          </div>

          <div className="space-y-2">
            <Label>Delivery channel</Label>
            <Select defaultValue={watch("channel")} onValueChange={(value) => setValue("channel", value as "YELP_THREAD" | "EMAIL")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="YELP_THREAD">Yelp thread</SelectItem>
                <SelectItem value="EMAIL">External email</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {watch("channel") === "EMAIL" ? (
            <div className="space-y-2">
              <Label htmlFor="automation-template-subject">Email subject</Label>
              <Input id="automation-template-subject" placeholder="Thanks for contacting {{business_name}}" {...register("subjectTemplate")} />
              {errors.subjectTemplate ? <p className="text-sm text-destructive">{errors.subjectTemplate.message}</p> : <p className="text-xs text-muted-foreground">Leave blank to use a safe fallback subject.</p>}
            </div>
          ) : (
            <div className="rounded-xl border border-border/80 bg-muted/10 px-4 py-3 text-xs text-muted-foreground">
              Yelp thread templates do not use an email subject. If this template falls back to email, the console uses a safe default subject.
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="automation-template-body">{watch("channel") === "EMAIL" ? "Email body" : "Yelp thread message"}</Label>
            <Textarea
              id="automation-template-body"
              placeholder={"Hi {{customer_name}},\n\nThanks for contacting {{business_name}} about {{service_type}}. We received your Yelp request and will follow up shortly.\n\nReference: {{lead_reference}}"}
              rows={8}
              {...register("bodyTemplate")}
            />
            {errors.bodyTemplate ? <p className="text-sm text-destructive">{errors.bodyTemplate.message}</p> : null}
          </div>

          <div className="rounded-xl border border-border/80 bg-muted/10 px-4 py-3 text-xs text-muted-foreground">
            Available variables: {variableExamples.join(", ")}
          </div>

          <div className="flex items-center justify-between rounded-xl border border-border/80 bg-muted/10 px-4 py-3">
            <div>
              <div className="text-sm font-medium">Enabled</div>
              <div className="text-xs text-muted-foreground">Disabled templates stay available for historical attempts but will not be selected by rules.</div>
            </div>
            <Switch checked={watch("isEnabled")} onCheckedChange={(checked) => setValue("isEnabled", checked)} />
          </div>

          <div className="flex gap-2">
            <Button disabled={isSubmitting} type="submit">
              {isSubmitting ? "Saving..." : isEditing ? "Save template" : "Create template"}
            </Button>
            {isEditing ? (
              <Button onClick={() => router.replace("/settings")} type="button" variant="outline">
                Cancel
              </Button>
            ) : null}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
