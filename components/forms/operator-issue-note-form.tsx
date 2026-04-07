"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { operatorIssueNoteSchema } from "@/features/issues/schemas";
import { apiFetch } from "@/lib/utils/client-api";

type NoteValues = {
  note: string;
};

export function OperatorIssueNoteForm({ issueId }: { issueId: string }) {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting }
  } = useForm<NoteValues>({
    resolver: zodResolver(operatorIssueNoteSchema),
    defaultValues: {
      note: ""
    }
  });

  const submit = handleSubmit(async (values) => {
    try {
      await apiFetch(`/api/issues/${issueId}/note`, {
        method: "POST",
        body: JSON.stringify(values)
      });
      toast.success("Internal note added.");
      reset();
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to add note.");
    }
  });

  return (
    <form className="space-y-3" onSubmit={submit}>
      <div className="text-sm font-medium">Internal note</div>
      <div className="space-y-1">
        <Label htmlFor="issue-note">Note</Label>
        <Textarea id="issue-note" placeholder="Record operator context for the next reviewer." rows={4} {...register("note")} />
        {errors.note ? <p className="text-sm text-destructive">{errors.note.message}</p> : null}
      </div>
      <Button disabled={isSubmitting} type="submit" variant="outline">
        {isSubmitting ? "Saving..." : "Add note"}
      </Button>
    </form>
  );
}
