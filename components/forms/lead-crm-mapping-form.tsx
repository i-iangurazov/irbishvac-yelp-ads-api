"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { crmLeadMappingFormSchema, type CrmLeadMappingFormValues } from "@/features/crm-enrichment/schemas";
import { apiFetch } from "@/lib/utils/client-api";

const operatorVisibleStates = [
  { value: "UNRESOLVED", label: "Unresolved" },
  { value: "MANUAL_OVERRIDE", label: "Manual override" },
  { value: "CONFLICT", label: "Conflict" },
  { value: "ERROR", label: "Error" }
] as const;

export function LeadCrmMappingForm({
  leadId,
  defaultValues
}: {
  leadId: string;
  defaultValues: Partial<CrmLeadMappingFormValues>;
}) {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    watch,
    formState: { isSubmitting, errors }
  } = useForm<CrmLeadMappingFormValues>({
    resolver: zodResolver(crmLeadMappingFormSchema),
    defaultValues: {
      state: "UNRESOLVED",
      ...defaultValues
    }
  });
  const selectedState = watch("state");

  const submit = handleSubmit(async (values) => {
    try {
      await apiFetch(`/api/leads/${leadId}/crm-mapping`, {
        method: "POST",
        body: JSON.stringify({
          ...values,
          matchMethod:
            values.state === "MANUAL_OVERRIDE"
              ? "manual_override"
              : values.state === "UNRESOLVED"
                ? "operator_unresolved"
                : "operator_review"
        })
      });
      toast.success("CRM mapping saved.");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to save CRM mapping.");
    }
  });

  return (
    <form className="space-y-4" onSubmit={submit}>
      <div className="space-y-2">
        <Label htmlFor="crm-mapping-state">Mapping state</Label>
        <select
          className="ui-native-select"
          id="crm-mapping-state"
          {...register("state")}
        >
          {operatorVisibleStates.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="externalCrmLeadId">CRM lead ID</Label>
          <Input id="externalCrmLeadId" placeholder="crm-lead-123" {...register("externalCrmLeadId")} />
          {errors.externalCrmLeadId ? <p className="text-sm text-destructive">{errors.externalCrmLeadId.message}</p> : null}
        </div>
        <div className="space-y-2">
          <Label htmlFor="externalOpportunityId">Opportunity ID</Label>
          <Input id="externalOpportunityId" placeholder="opp-456" {...register("externalOpportunityId")} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="externalJobId">Job ID</Label>
          <Input id="externalJobId" placeholder="job-789" {...register("externalJobId")} />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="issueSummary">
          {selectedState === "CONFLICT" || selectedState === "ERROR" ? "Issue summary" : "Operator note"}
        </Label>
        <Textarea
          id="issueSummary"
          placeholder={
            selectedState === "MANUAL_OVERRIDE"
              ? "Why this lead is being linked manually."
              : selectedState === "UNRESOLVED"
                ? "Optional note for why this lead is still unresolved."
                : "Explain the conflict or error so the next operator can resolve it."
          }
          {...register("issueSummary")}
        />
        {errors.issueSummary ? <p className="text-sm text-destructive">{errors.issueSummary.message}</p> : null}
      </div>

      <div className="flex items-center justify-between gap-3 rounded-xl border border-border/80 bg-muted/10 px-4 py-3 text-xs text-muted-foreground">
        <span>Operator actions save internal mapping records. Yelp-native lead history remains untouched.</span>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Saving..." : "Save mapping"}
        </Button>
      </div>
    </form>
  );
}
