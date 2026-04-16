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

type LocationOption = {
  id: string;
  name: string;
};

type ReportScheduleInitialValues = Partial<ReportScheduleFormValues> & {
  id?: string | null;
  recipientEmails?: string;
};

export function ReportScheduleForm({
  initialValues,
  locations
}: {
  initialValues?: ReportScheduleInitialValues | null;
  locations: LocationOption[];
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
      deliveryScope: initialValues?.deliveryScope ?? "ACCOUNT_ONLY",
      timezone: initialValues?.timezone ?? "America/Los_Angeles",
      sendDayOfWeek: initialValues?.sendDayOfWeek ?? 1,
      sendDayOfMonth: initialValues?.sendDayOfMonth ?? 1,
      sendHour: initialValues?.sendHour ?? 8,
      sendMinute: initialValues?.sendMinute ?? 0,
      deliverPerLocation: initialValues?.deliverPerLocation ?? false,
      isEnabled: initialValues?.isEnabled ?? true,
      recipientEmails: initialValues?.recipientEmails ?? "",
      locationRecipientOverrides: initialValues?.locationRecipientOverrides ?? []
    }
  });
  const cadence = watch("cadence");
  const deliveryScope = watch("deliveryScope");
  const locationRecipientOverrides = watch("locationRecipientOverrides") ?? [];
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

  function updateOverride(index: number, patch: Partial<ReportScheduleFormValues["locationRecipientOverrides"][number]>) {
    const next = [...locationRecipientOverrides];
    next[index] = {
      ...next[index],
      ...patch
    };
    setValue("locationRecipientOverrides", next, {
      shouldDirty: true,
      shouldValidate: true
    });
  }

  function removeOverride(index: number) {
    setValue(
      "locationRecipientOverrides",
      locationRecipientOverrides.filter((_, currentIndex) => currentIndex !== index),
      {
        shouldDirty: true,
        shouldValidate: true
      }
    );
  }

  function addOverride() {
    const usedLocationIds = new Set(locationRecipientOverrides.map((override) => override.locationId));
    const firstUnused = locations.find((location) => !usedLocationIds.has(location.id));

    if (!firstUnused) {
      toast.error("All active locations already have recipient overrides.");
      return;
    }

    setValue(
      "locationRecipientOverrides",
      [
        ...locationRecipientOverrides,
        {
          locationId: firstUnused.id,
          recipientEmails: ""
        }
      ],
      {
        shouldDirty: true,
        shouldValidate: true
      }
    );
  }

  return (
    <Card className="shadow-none">
      <CardHeader>
        <CardTitle>{isEditing ? "Edit recurring delivery" : "New recurring delivery"}</CardTitle>
        <CardDescription>
          Configure rollup and per-location delivery with explicit fallback routing.
        </CardDescription>
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
            <Select
              onValueChange={(value) => setValue("cadence", value as "WEEKLY" | "MONTHLY")}
              value={cadence}
            >
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
            <Label>Delivery scope</Label>
            <Select
              onValueChange={(value) => {
                setValue("deliveryScope", value as ReportScheduleFormValues["deliveryScope"], {
                  shouldDirty: true,
                  shouldValidate: true
                });
                setValue("deliverPerLocation", value !== "ACCOUNT_ONLY", {
                  shouldDirty: true
                });
              }}
              value={deliveryScope}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ACCOUNT_ONLY">Account rollup only</SelectItem>
                <SelectItem value="LOCATION_ONLY">Per location only</SelectItem>
                <SelectItem value="ACCOUNT_AND_LOCATION">Account and per location</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="scheduleTimezone">Timezone</Label>
            <Input id="scheduleTimezone" placeholder="America/Los_Angeles" {...register("timezone")} />
            {errors.timezone ? (
              <p className="text-sm text-destructive">{errors.timezone.message}</p>
            ) : (
              <p className="text-xs text-muted-foreground">Use an IANA timezone name so weekly and monthly windows resolve consistently.</p>
            )}
          </div>

          {cadence === "WEEKLY" ? (
            <div className="space-y-2">
              <Label>Send day</Label>
              <Select
                onValueChange={(value) => setValue("sendDayOfWeek", Number(value), { shouldValidate: true })}
                value={String(watch("sendDayOfWeek") ?? 1)}
              >
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
              {errors.sendDayOfMonth ? (
                <p className="text-sm text-destructive">{errors.sendDayOfMonth.message}</p>
              ) : (
                <p className="text-xs text-muted-foreground">Months shorter than the configured day send on the last day of that month.</p>
              )}
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
            <Label htmlFor="recipientEmails">Default account recipients</Label>
            <Textarea
              id="recipientEmails"
              placeholder={"owner@example.com\nops@example.com"}
              rows={4}
              {...register("recipientEmails")}
            />
            {errors.recipientEmails ? (
              <p className="text-sm text-destructive">{errors.recipientEmails.message}</p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Used for account rollups and as the fallback recipient list for location runs without an override.
              </p>
            )}
          </div>

          {deliveryScope !== "ACCOUNT_ONLY" ? (
            <div className="space-y-3 rounded-xl border border-border/80 bg-muted/10 p-4 lg:col-span-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-medium">Location recipient overrides</div>
                  <div className="text-xs text-muted-foreground">
                    Optional overrides replace the default account recipients for a specific location. Locations without an override fall back automatically.
                  </div>
                </div>
                <Button onClick={addOverride} size="sm" type="button" variant="outline">
                  Add override
                </Button>
              </div>

              {locationRecipientOverrides.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border/80 bg-background px-4 py-3 text-sm text-muted-foreground">
                  No location-specific routing yet. All location runs will use the default account recipients.
                </div>
              ) : (
                <div className="space-y-3">
                  {locationRecipientOverrides.map((override, index) => (
                    <div className="grid gap-3 rounded-xl border border-border/80 bg-background p-4 md:grid-cols-[220px_1fr_auto] md:items-start" key={`${override.locationId}-${index}`}>
                      <div className="space-y-1">
                        <Label>Location</Label>
                        <Select
                          onValueChange={(value) => updateOverride(index, { locationId: value })}
                          value={override.locationId}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select location" />
                          </SelectTrigger>
                          <SelectContent>
                            {locations.map((location) => (
                              <SelectItem key={location.id} value={location.id}>
                                {location.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {errors.locationRecipientOverrides?.[index]?.locationId ? (
                          <p className="text-sm text-destructive">{errors.locationRecipientOverrides[index]?.locationId?.message}</p>
                        ) : null}
                      </div>

                      <div className="space-y-1">
                        <Label>Recipients</Label>
                        <Textarea
                          onChange={(event) => updateOverride(index, { recipientEmails: event.target.value })}
                          placeholder={"manager@example.com\nbranch@example.com"}
                          rows={3}
                          value={override.recipientEmails}
                        />
                        {errors.locationRecipientOverrides?.[index]?.recipientEmails ? (
                          <p className="text-sm text-destructive">{errors.locationRecipientOverrides[index]?.recipientEmails?.message}</p>
                        ) : null}
                      </div>

                      <div className="pt-6">
                        <Button onClick={() => removeOverride(index)} size="sm" type="button" variant="ghost">
                          Remove
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : null}

          <div className="rounded-xl border border-border/80 bg-muted/10 px-4 py-3 lg:col-span-2">
            <div className="text-sm font-medium">Routing preview</div>
            <div className="mt-1 text-xs text-muted-foreground">
              {deliveryScope === "ACCOUNT_ONLY"
                ? "Only the account rollup email will be sent."
                : deliveryScope === "LOCATION_ONLY"
                  ? "Only location-scoped emails will be sent. Account rollup delivery will be skipped."
                  : "The account rollup and the location-scoped emails will both be sent."}
            </div>
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
