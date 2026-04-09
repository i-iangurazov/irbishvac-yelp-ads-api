"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/utils/client-api";

type LifecycleSyncResult = {
  selectedCount: number;
  completedCount: number;
  partialCount: number;
  failedCount: number;
};

export function ServiceTitanLifecycleSyncForm({
  disabled
}: {
  disabled?: boolean;
}) {
  const [runningMode, setRunningMode] = useState<"DUE" | "RECENT" | null>(null);

  const runSync = async (mode: "DUE" | "RECENT") => {
    try {
      setRunningMode(mode);
      const result = await apiFetch<LifecycleSyncResult>("/api/integrations/servicetitan/lifecycle-sync", {
        method: "POST",
        body: JSON.stringify(
          mode === "RECENT"
            ? {
                mode,
                lookbackDays: 7,
                limit: 25
              }
            : {
                mode,
                limit: 25
              }
        )
      });

      if (result.failedCount > 0 || result.partialCount > 0) {
        toast.error(
          `Lifecycle sync finished with ${result.completedCount} complete, ${result.partialCount} partial, and ${result.failedCount} failed.`
        );
        return;
      }

      toast.success(
        result.selectedCount > 0
          ? `Lifecycle sync updated ${result.completedCount} mapped lead${result.completedCount === 1 ? "" : "s"}.`
          : "No mapped leads were due for lifecycle sync."
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to run ServiceTitan lifecycle sync.");
    } finally {
      setRunningMode(null);
    }
  };

  return (
    <div className="flex flex-wrap gap-3">
      <Button type="button" onClick={() => runSync("DUE")} disabled={disabled || Boolean(runningMode)}>
        {runningMode === "DUE" ? "Syncing..." : "Sync due lifecycle updates"}
      </Button>
      <Button type="button" variant="outline" onClick={() => runSync("RECENT")} disabled={disabled || Boolean(runningMode)}>
        {runningMode === "RECENT" ? "Resyncing..." : "Resync last 7 days"}
      </Button>
    </div>
  );
}
