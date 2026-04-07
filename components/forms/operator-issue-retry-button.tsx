"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/utils/client-api";

export function OperatorIssueRetryButton({
  issueId,
  label = "Retry"
}: {
  issueId: string;
  label?: string;
}) {
  const router = useRouter();

  async function handleRetry() {
    try {
      await apiFetch(`/api/issues/${issueId}/retry`, {
        method: "POST"
      });
      toast.success("Retry requested.");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to retry issue.");
    }
  }

  return (
    <Button onClick={handleRetry} type="button">
      {label}
    </Button>
  );
}
