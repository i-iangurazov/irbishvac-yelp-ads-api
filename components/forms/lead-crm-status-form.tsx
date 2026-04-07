"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { crmLeadStatusFormSchema, type CrmLeadStatusFormValues } from "@/features/crm-enrichment/schemas";
import { apiFetch } from "@/lib/utils/client-api";

const lifecycleStatuses = [
  ["NEW", "New"],
  ["CONTACTED", "Contacted"],
  ["BOOKED", "Booked"],
  ["SCHEDULED", "Scheduled"],
  ["JOB_IN_PROGRESS", "Job in progress"],
  ["COMPLETED", "Completed"],
  ["CANCELED", "Canceled"],
  ["CLOSED_WON", "Closed won"],
  ["CLOSED_LOST", "Closed lost"],
  ["LOST", "Lost"]
] as const;

function toDateTimeLocalValue(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function LeadCrmStatusForm({
  leadId,
  disabled
}: {
  leadId: string;
  disabled: boolean;
}) {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    formState: { isSubmitting, errors }
  } = useForm<CrmLeadStatusFormValues>({
    resolver: zodResolver(crmLeadStatusFormSchema),
    defaultValues: {
      status: "NEW",
      occurredAt: toDateTimeLocalValue(new Date()),
      substatus: "",
      note: ""
    }
  });

  const submit = handleSubmit(async (values) => {
    try {
      await apiFetch(`/api/leads/${leadId}/crm-statuses`, {
        method: "POST",
        body: JSON.stringify({
          ...values,
          occurredAt: new Date(values.occurredAt).toISOString()
        })
      });
      toast.success("Internal lifecycle status saved.");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to save internal lifecycle status.");
    }
  });

  return (
    <form className="space-y-4" onSubmit={submit}>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="crm-status">Internal status</Label>
          <select
            className="ui-native-select"
            disabled={disabled}
            id="crm-status"
            {...register("status")}
          >
            {lifecycleStatuses.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="crm-occurred-at">Occurred at</Label>
          <Input disabled={disabled} id="crm-occurred-at" type="datetime-local" {...register("occurredAt")} />
          {errors.occurredAt ? <p className="text-sm text-destructive">{errors.occurredAt.message}</p> : null}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="crm-substatus">Substatus</Label>
        <Input disabled={disabled} id="crm-substatus" placeholder="Optional queue or outcome detail." {...register("substatus")} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="crm-note">Operator note</Label>
        <Textarea
          disabled={disabled}
          id="crm-note"
          placeholder="Record the internal source or context for this lifecycle change."
          {...register("note")}
        />
      </div>

      <div className="flex items-center justify-between gap-3 rounded-xl border border-border/80 bg-muted/10 px-4 py-3 text-xs text-muted-foreground">
        <span>
          {disabled
            ? "Resolve the CRM mapping before recording internal lifecycle states."
            : "These statuses are internal-only. They do not come from Yelp and will render separately from the Yelp timeline."}
        </span>
        <Button disabled={disabled || isSubmitting} type="submit">
          {isSubmitting ? "Saving..." : "Add status"}
        </Button>
      </div>
    </form>
  );
}
