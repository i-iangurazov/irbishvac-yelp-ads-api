"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { operatorIssueResolutionSchema } from "@/features/issues/schemas";
import { apiFetch } from "@/lib/utils/client-api";

type ResolutionValues = {
  reason: string;
  note?: string;
};

export function OperatorIssueResolutionForm({
  issueId,
  action,
  title,
  submitLabel
}: {
  issueId: string;
  action: "resolve" | "ignore";
  title: string;
  submitLabel: string;
}) {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting }
  } = useForm<ResolutionValues>({
    resolver: zodResolver(operatorIssueResolutionSchema),
    defaultValues: {
      reason: "",
      note: ""
    }
  });

  const submit = handleSubmit(async (values) => {
    try {
      await apiFetch(`/api/issues/${issueId}/${action}`, {
        method: "POST",
        body: JSON.stringify(values)
      });
      toast.success(action === "resolve" ? "Issue resolved." : "Issue ignored.");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to update issue.");
    }
  });

  return (
    <form className="space-y-3" onSubmit={submit}>
      <div className="text-sm font-medium">{title}</div>
      <div className="space-y-1">
        <Label htmlFor={`${action}-reason`}>Reason</Label>
        <Input id={`${action}-reason`} placeholder={action === "resolve" ? "Handled in CRM" : "Known test tenant issue"} {...register("reason")} />
        {errors.reason ? <p className="text-sm text-destructive">{errors.reason.message}</p> : null}
      </div>
      <div className="space-y-1">
        <Label htmlFor={`${action}-note`}>Note</Label>
        <Textarea id={`${action}-note`} placeholder="Optional operator context." rows={3} {...register("note")} />
        {errors.note ? <p className="text-sm text-destructive">{errors.note.message}</p> : null}
      </div>
      <Button disabled={isSubmitting} type="submit" variant={action === "resolve" ? "outline" : "secondary"}>
        {isSubmitting ? "Saving..." : submitLabel}
      </Button>
    </form>
  );
}
