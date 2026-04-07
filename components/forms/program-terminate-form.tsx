"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  AlertDialogDismiss
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { terminateProgramFormSchema } from "@/features/ads-programs/schemas";
import { apiFetch } from "@/lib/utils/client-api";

export function ProgramTerminateForm({
  programId,
  disabledReason
}: {
  programId: string;
  disabledReason?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const { register, handleSubmit, formState: { isSubmitting } } = useForm({
    resolver: zodResolver(terminateProgramFormSchema),
    defaultValues: {
      programId,
      endDate: "",
      reason: ""
    }
  });

  const submit = handleSubmit(async (values) => {
    try {
      const result = await apiFetch<{ jobId: string }>(`/api/programs/${programId}/terminate`, {
        method: "POST",
        body: JSON.stringify(values)
      });
      setOpen(false);
      toast.success("Terminate request submitted to Yelp.");
      router.push(`/programs/${programId}?jobId=${result.jobId}`);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to terminate program.");
    }
  });

  return (
    <div className="flex flex-col items-end gap-1">
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogTrigger asChild>
          <Button variant="destructive" disabled={Boolean(disabledReason)} title={disabledReason}>
            Terminate program
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Terminate this program?</AlertDialogTitle>
            <AlertDialogDescription>
              This sends Yelp a terminate request by program ID. The requested end date and reason below are stored as internal audit notes only and are not included in the upstream terminate payload.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <form className="space-y-4" onSubmit={submit}>
            <div className="space-y-2">
              <Label htmlFor="endDate">Internal requested end date note</Label>
              <Input id="endDate" type="date" {...register("endDate")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="reason">Internal termination reason</Label>
              <Textarea id="reason" {...register("reason")} />
            </div>
            <AlertDialogFooter>
              <AlertDialogDismiss type="button">Cancel</AlertDialogDismiss>
              <Button type="submit" variant="destructive" disabled={isSubmitting}>
                {isSubmitting ? "Submitting..." : "Send terminate request"}
              </Button>
            </AlertDialogFooter>
          </form>
        </AlertDialogContent>
      </AlertDialog>
      {disabledReason ? <p className="max-w-72 text-right text-xs text-muted-foreground">{disabledReason}</p> : null}
    </div>
  );
}
