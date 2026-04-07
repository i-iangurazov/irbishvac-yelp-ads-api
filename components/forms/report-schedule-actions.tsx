"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/utils/client-api";

export function ReportScheduleGenerateButton({ scheduleId }: { scheduleId: string }) {
  const router = useRouter();

  return (
    <Button
      size="sm"
      variant="outline"
      onClick={async () => {
        try {
          await apiFetch(`/api/reports/schedules/${scheduleId}/generate`, {
            method: "POST"
          });
          toast.success("Schedule run queued.");
          router.refresh();
        } catch (error) {
          toast.error(error instanceof Error ? error.message : "Unable to queue the schedule.");
        }
      }}
    >
      Generate now
    </Button>
  );
}

export function ReportScheduleResendButton({ runId }: { runId: string }) {
  const router = useRouter();

  return (
    <Button
      size="sm"
      variant="outline"
      onClick={async () => {
        try {
          await apiFetch(`/api/reports/runs/${runId}/resend`, {
            method: "POST"
          });
          toast.success("Report delivery retried.");
          router.refresh();
        } catch (error) {
          toast.error(error instanceof Error ? error.message : "Unable to resend this run.");
        }
      }}
    >
      Resend
    </Button>
  );
}
