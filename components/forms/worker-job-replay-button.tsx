"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, RotateCcw } from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogDismiss,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/utils/client-api";

export function WorkerJobReplayButton({ jobId }: { jobId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleReplay() {
    setIsSubmitting(true);

    try {
      await apiFetch(`/api/worker-jobs/${jobId}/replay`, { method: "POST" });
      toast.success("Worker queued for one controlled retry.");
      setOpen(false);
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to replay worker.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button size="sm" variant="outline">
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
          Replay
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Replay this worker once?</AlertDialogTitle>
          <AlertDialogDescription>
            This clears the dead-letter state and queues the same saved payload.
            The normal idempotency and provider safety checks still apply.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogDismiss disabled={isSubmitting}>
            Cancel
          </AlertDialogDismiss>
          <Button disabled={isSubmitting} onClick={handleReplay} type="button">
            {isSubmitting ? (
              <LoaderCircle
                className="h-4 w-4 animate-spin"
                aria-hidden="true"
              />
            ) : (
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
            )}
            Queue retry
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
