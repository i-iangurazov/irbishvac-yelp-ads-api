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
  AlertDialogDismiss,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { deleteBusinessFormSchema } from "@/features/businesses/schemas";
import { apiFetch } from "@/lib/utils/client-api";

type DeleteImpact = {
  mappings: number;
  programs: number;
  programJobs: number;
  featureSnapshots: number;
  reportRequests: number;
  reportResults: number;
  auditEvents: number;
};

export function BusinessDeleteForm({
  businessId,
  businessName,
  deleteImpact,
  disabledReason
}: {
  businessId: string;
  businessName: string;
  deleteImpact: DeleteImpact;
  disabledReason?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { isSubmitting }
  } = useForm({
    resolver: zodResolver(deleteBusinessFormSchema),
    defaultValues: {
      businessId,
      confirmationText: ""
    }
  });

  const submit = handleSubmit(async (values) => {
    try {
      await apiFetch<{ deleted: boolean }>(`/api/businesses/${businessId}`, {
        method: "DELETE",
        body: JSON.stringify(values)
      });
      setOpen(false);
      toast.success("Business deleted from the console.");
      router.push("/businesses");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to delete business.");
    }
  });

  return (
    <div className="flex flex-col items-end gap-1">
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogTrigger asChild>
          <Button variant="destructive" disabled={Boolean(disabledReason)} title={disabledReason}>
            Delete business
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this business from the console?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the local business record and deletes all local programs, jobs, feature snapshots, and mappings tied to it.
              It does not send termination requests to Yelp, so active or pending programs must be resolved first.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="grid gap-3 rounded-lg border border-border bg-muted/30 p-4 text-sm">
            <div className="font-medium">Delete impact</div>
            <div>Programs to delete: {deleteImpact.programs}</div>
            <div>Program jobs to delete: {deleteImpact.programJobs}</div>
            <div>Feature snapshots to delete: {deleteImpact.featureSnapshots}</div>
            <div>Business mappings to delete: {deleteImpact.mappings}</div>
            <div>Report requests that will be detached: {deleteImpact.reportRequests}</div>
            <div>Report results that will be detached: {deleteImpact.reportResults}</div>
            <div>Audit events that will be detached: {deleteImpact.auditEvents}</div>
          </div>
          <form className="space-y-4" onSubmit={submit}>
            <input type="hidden" {...register("businessId")} />
            <div className="space-y-2">
              <Label htmlFor="confirmationText">Type the exact business name to confirm</Label>
              <Input id="confirmationText" placeholder={businessName} {...register("confirmationText")} />
            </div>
            <AlertDialogFooter>
              <AlertDialogDismiss type="button">Cancel</AlertDialogDismiss>
              <Button type="submit" variant="destructive" disabled={isSubmitting}>
                {isSubmitting ? "Deleting..." : "Confirm delete"}
              </Button>
            </AlertDialogFooter>
          </form>
        </AlertDialogContent>
      </AlertDialog>
      {disabledReason ? <p className="max-w-80 text-right text-xs text-muted-foreground">{disabledReason}</p> : null}
    </div>
  );
}
