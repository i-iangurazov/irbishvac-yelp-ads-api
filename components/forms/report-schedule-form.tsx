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
import { type ReportScheduleFormValues, reportScheduleFormSchema } from "@/features/report-delivery/schemas";
import { apiFetch } from "@/lib/utils/client-api";

const weekdayOptions = [
  { label: "Sunday", value: "0" },
  { label: "Monday", value: "1" },
  { label: "Tuesday", value: "2" },
  { label: "Wednesday", value: "3" },
  { label: "Thursday", value: "4" },
  { label: "Friday", value: "5" },
  { label: "Saturday", value: "6" }
] as const;

export function ReportScheduleForm({
  initialValues
}: {
  initialValues?: (Partial<ReportScheduleFormValues> & { id?: string | null; recipientEmails?: string }) | null;
}) {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting }
  } = useForm<ReportScheduleFormValues>({
    resolver: zodResolver(reportScheduleFormSchema),
    defaultValues: {
      name: initialValues?.name ?? "",
      cadence: initialValues?.cadence ?? "WEEKLY",
      timezone: initialValues?.timezone ?? "America/Los_Angeles",
      sendDayOfWeek: initialValues?.sendDayOfWeek ?? 1,
      sendDayOfMonth: initialValues?.sendDayOfMonth ?? 1,
      sendHour: initialValues?.sendHour ?? 8,
      sendMinute: initialValues?.sendMinute ?? 0,
      deliverPerLocation: initialValues?.deliverPerLocation ?? false,
      isEnabled: initialValues?.isEnabled ?? true,
      recipientEmails: initialValues?.recipientEmails ?? ""
    }
  });
  const cadence = watch("cadence");
  const isEditing = Boolean(initialValues?.id);

  const submit = handleSubmit(async (values) => {
    try {
      const method = isEditing ? "PATCH" : "POST";
      const url = isEditing ? `/api/reports/schedules/${initialValues?.id}` : "/api/reports/schedules";

      await apiFetch(url, {
        method,
        body: JSON.stringify(values)
      });

      toast.success(isEditing ? "Schedule updated." : "Schedule created.");
      router.replace("/reporting");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to save schedule.");
    }
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{isEditing ? "Edit recurring delivery" : "New recurring delivery"}</CardTitle>
        <CardDescription>Weekly or monthly email delivery using the saved reporting pipeline. Recipients get a dashboard link plus CSV attachment.</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4 lg:grid-cols-2" onSubmit={submit}>
          <div className="space-y-2">
            <Label htmlFor="scheduleName">Name</Label>
            <Input id="scheduleName" placeholder="Weekly client report" {...register("name")} />
            {errors.name ? <p className="text-sm text-destructive">{errors.name.message}</p> : null}
          </div>

          <div className="space-y-2">
            <Label>Cadence</Label>
            <Select defaultValue={watch("cadence")} onValueChange={(value) => setValue("cadence", value as "WEEKLY" | "MONTHLY")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="WEEKLY">Weekly</SelectItem>
                <SelectItem value="MONTHLY">Monthly</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="scheduleTimezone">Timezone</Label>
            <Input id="scheduleTimezone" placeholder="America/Los_Angeles" {...register("timezone")} />
            {errors.timezone ? <p className="text-sm text-destructive">{errors.timezone.message}</p> : <p className="text-xs text-muted-foreground">Use an IANA timezone name so weekly and monthly windows resolve consistently.</p>}
          </div>

          {cadence === "WEEKLY" ? (
            <div className="space-y-2">
              <Label>Send day</Label>
              <Select defaultValue={String(watch("sendDayOfWeek") ?? 1)} onValueChange={(value) => setValue("sendDayOfWeek", Number(value))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {weekdayOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.sendDayOfWeek ? <p className="text-sm text-destructive">{errors.sendDayOfWeek.message}</p> : null}
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="sendDayOfMonth">Send day</Label>
              <Input id="sendDayOfMonth" max={31} min={1} type="number" {...register("sendDayOfMonth", { valueAsNumber: true })} />
              {errors.sendDayOfMonth ? <p className="text-sm text-destructive">{errors.sendDayOfMonth.message}</p> : <p className="text-xs text-muted-foreground">Months shorter than the configured day send on the last day of that month.</p>}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="sendHour">Send hour</Label>
            <Input id="sendHour" max={23} min={0} type="number" {...register("sendHour", { valueAsNumber: true })} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="sendMinute">Send minute</Label>
            <Input id="sendMinute" max={59} min={0} type="number" {...register("sendMinute", { valueAsNumber: true })} />
          </div>

          <div className="space-y-2 lg:col-span-2">
            <Label htmlFor="recipientEmails">Recipients</Label>
            <Textarea
              id="recipientEmails"
              placeholder={"owner@example.com\nops@example.com"}
              rows={4}
              {...register("recipientEmails")}
            />
            {errors.recipientEmails ? (
              <p className="text-sm text-destructive">{errors.recipientEmails.message}</p>
            ) : (
              <p className="text-xs text-muted-foreground">Separate emails with commas or new lines.</p>
            )}
          </div>

          <div className="flex items-center justify-between rounded-xl border border-border/80 bg-muted/10 px-4 py-3">
            <div>
              <div className="text-sm font-medium">Per-location delivery</div>
              <div className="text-xs text-muted-foreground">When enabled, the account run generates location-scoped emails where mapped data exists.</div>
            </div>
            <Switch checked={watch("deliverPerLocation")} onCheckedChange={(checked) => setValue("deliverPerLocation", checked)} />
          </div>

          <div className="flex items-center justify-between rounded-xl border border-border/80 bg-muted/10 px-4 py-3">
            <div>
              <div className="text-sm font-medium">Enabled</div>
              <div className="text-xs text-muted-foreground">Disabled schedules stay in the list but do not enqueue new runs.</div>
            </div>
            <Switch checked={watch("isEnabled")} onCheckedChange={(checked) => setValue("isEnabled", checked)} />
          </div>

          <div className="lg:col-span-2 flex gap-2">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : isEditing ? "Save schedule" : "Create schedule"}
            </Button>
            {isEditing ? (
              <Button type="button" variant="outline" onClick={() => router.replace("/reporting")}>
                Cancel
              </Button>
            ) : null}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
