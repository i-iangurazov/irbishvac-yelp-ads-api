"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  leadAutomationRuleFormSchema,
  type LeadAutomationRuleFormValues
} from "@/features/autoresponder/schemas";
import { apiFetch } from "@/lib/utils/client-api";

const weekdayOptions = [
  { value: 0, label: "Sun" },
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" }
] as const;

function minuteToTimeString(value: number | undefined) {
  if (value === undefined) {
    return "";
  }

  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function timeStringToMinute(value: string) {
  if (!value) {
    return undefined;
  }

  const [hours, minutes] = value.split(":").map((part) => Number(part));

  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) {
    return undefined;
  }

  return hours * 60 + minutes;
}

function getTemplateChannelLabel(channel: "YELP_THREAD" | "EMAIL" | undefined) {
  return channel === "EMAIL" ? "External email" : "Yelp thread";
}

export function LeadAutomationRuleForm({
  initialValues,
  ruleId,
  templates,
  locations,
  serviceCategories
}: {
  initialValues?: Partial<LeadAutomationRuleFormValues> | null;
  ruleId?: string | null;
  templates: Array<{ id: string; name: string; isEnabled: boolean; channel: "YELP_THREAD" | "EMAIL" }>;
  locations: Array<{ id: string; name: string }>;
  serviceCategories: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const isEditing = Boolean(ruleId);
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting }
  } = useForm<LeadAutomationRuleFormValues>({
    resolver: zodResolver(leadAutomationRuleFormSchema),
    defaultValues: {
      name: initialValues?.name ?? "",
      templateId: initialValues?.templateId ?? templates[0]?.id ?? "",
      channel: initialValues?.channel ?? templates[0]?.channel ?? "YELP_THREAD",
      isEnabled: initialValues?.isEnabled ?? true,
      priority: initialValues?.priority ?? 100,
      locationId: initialValues?.locationId ?? "",
      serviceCategoryId: initialValues?.serviceCategoryId ?? "",
      onlyDuringWorkingHours: initialValues?.onlyDuringWorkingHours ?? false,
      timezone: initialValues?.timezone ?? "America/Los_Angeles",
      workingDays: initialValues?.workingDays ?? [1, 2, 3, 4, 5],
      startMinute: initialValues?.startMinute,
      endMinute: initialValues?.endMinute
    }
  });
  const workingDays = watch("workingDays") ?? [];
  const onlyDuringWorkingHours = watch("onlyDuringWorkingHours");

  const toggleWorkingDay = (day: number, checked: boolean) => {
    const next = checked
      ? [...new Set([...workingDays, day])].sort((left, right) => left - right)
      : workingDays.filter((value) => value !== day);

    setValue("workingDays", next, { shouldValidate: true });
  };

  const submit = handleSubmit(async (values) => {
    try {
      const url = isEditing ? `/api/settings/autoresponder/rules/${ruleId}` : "/api/settings/autoresponder/rules";
      const method = isEditing ? "PATCH" : "POST";

      await apiFetch(url, {
        method,
        body: JSON.stringify(values)
      });

      toast.success(isEditing ? "Automation rule updated." : "Automation rule created.");
      router.replace("/settings");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to save automation rule.");
    }
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{isEditing ? "Edit rule" : "New rule"}</CardTitle>
        <CardDescription>Rules decide whether the first response should send and which template to use. Lower priority numbers win.</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={submit}>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="automation-rule-name">Rule name</Label>
              <Input id="automation-rule-name" placeholder="Default weekday response" {...register("name")} />
              {errors.name ? <p className="text-sm text-destructive">{errors.name.message}</p> : null}
            </div>

            <div className="space-y-2">
              <Label>Template</Label>
              <Select
                defaultValue={watch("templateId")}
                onValueChange={(value) => {
                  setValue("templateId", value, { shouldValidate: true });
                  const selectedTemplate = templates.find((template) => template.id === value);

                  if (selectedTemplate) {
                    setValue("channel", selectedTemplate.channel, { shouldValidate: true });
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select template" />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((template) => (
                    <SelectItem key={template.id} value={template.id}>
                      {template.name} • {getTemplateChannelLabel(template.channel)}{template.isEnabled ? "" : " (disabled)"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.templateId ? <p className="text-sm text-destructive">{errors.templateId.message}</p> : null}
              <p className="text-xs text-muted-foreground">
                Channel follows the selected template:{" "}
                <span className="font-medium">
                  {getTemplateChannelLabel(templates.find((template) => template.id === watch("templateId"))?.channel)}
                </span>
              </p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="automation-rule-priority">Priority</Label>
              <Input id="automation-rule-priority" min={0} step={1} type="number" {...register("priority", { valueAsNumber: true })} />
            </div>

            <div className="space-y-2">
              <Label>Location scope</Label>
              <Select defaultValue={watch("locationId") || "all"} onValueChange={(value) => setValue("locationId", value === "all" ? "" : value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All locations</SelectItem>
                  {locations.map((location) => (
                    <SelectItem key={location.id} value={location.id}>
                      {location.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Service scope</Label>
              <Select defaultValue={watch("serviceCategoryId") || "all"} onValueChange={(value) => setValue("serviceCategoryId", value === "all" ? "" : value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All services</SelectItem>
                  {serviceCategories.map((serviceCategory) => (
                    <SelectItem key={serviceCategory.id} value={serviceCategory.id}>
                      {serviceCategory.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-xl border border-border/80 bg-muted/10 px-4 py-3">
            <div>
              <div className="text-sm font-medium">Only during working hours</div>
              <div className="text-xs text-muted-foreground">Outside the configured window the lead records a skipped attempt instead of queuing a later send.</div>
            </div>
            <Switch checked={onlyDuringWorkingHours} onCheckedChange={(checked) => setValue("onlyDuringWorkingHours", checked, { shouldValidate: true })} />
          </div>

          {onlyDuringWorkingHours ? (
            <div className="space-y-4 rounded-xl border border-border/80 bg-muted/10 px-4 py-4">
              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2 md:col-span-1">
                  <Label htmlFor="automation-rule-timezone">Timezone</Label>
                  <Input id="automation-rule-timezone" placeholder="America/Los_Angeles" {...register("timezone")} />
                  {errors.timezone ? <p className="text-sm text-destructive">{errors.timezone.message}</p> : null}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="automation-rule-start">Start</Label>
                  <Input
                    id="automation-rule-start"
                    type="time"
                    value={minuteToTimeString(watch("startMinute"))}
                    onChange={(event) => setValue("startMinute", timeStringToMinute(event.target.value), { shouldValidate: true })}
                  />
                  {errors.startMinute ? <p className="text-sm text-destructive">{errors.startMinute.message}</p> : null}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="automation-rule-end">End</Label>
                  <Input
                    id="automation-rule-end"
                    type="time"
                    value={minuteToTimeString(watch("endMinute"))}
                    onChange={(event) => setValue("endMinute", timeStringToMinute(event.target.value), { shouldValidate: true })}
                  />
                  {errors.endMinute ? <p className="text-sm text-destructive">{errors.endMinute.message}</p> : null}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Working days</Label>
                <div className="flex flex-wrap gap-3">
                  {weekdayOptions.map((option) => (
                    <label className="flex items-center gap-2 text-sm" key={option.value}>
                      <Checkbox
                        checked={workingDays.includes(option.value)}
                        onCheckedChange={(checked) => toggleWorkingDay(option.value, checked === true)}
                      />
                      <span>{option.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          ) : null}

          <div className="flex items-center justify-between rounded-xl border border-border/80 bg-muted/10 px-4 py-3">
            <div>
              <div className="text-sm font-medium">Enabled</div>
              <div className="text-xs text-muted-foreground">Disabled rules stay visible for audit history but will not evaluate on new leads.</div>
            </div>
            <Switch checked={watch("isEnabled")} onCheckedChange={(checked) => setValue("isEnabled", checked)} />
          </div>

          <div className="flex gap-2">
            <Button disabled={isSubmitting} type="submit">
              {isSubmitting ? "Saving..." : isEditing ? "Save rule" : "Create rule"}
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
