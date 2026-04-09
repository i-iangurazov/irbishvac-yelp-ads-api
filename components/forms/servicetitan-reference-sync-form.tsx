"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/utils/client-api";

export function ServiceTitanReferenceSyncForm({
  disabled
}: {
  disabled?: boolean;
}) {
  const [runningScope, setRunningScope] = useState<"ALL" | "LOCATIONS" | "SERVICES" | null>(null);

  const runSync = async (scope: "ALL" | "LOCATIONS" | "SERVICES") => {
    try {
      setRunningScope(scope);
      const result = await apiFetch<{ results: Array<{ type: string; status: string }> }>("/api/integrations/servicetitan/sync", {
        method: "POST",
        body: JSON.stringify({ scope })
      });

      const failures = result.results.filter((entry) => entry.status !== "COMPLETED");

      if (failures.length > 0) {
        toast.error("ServiceTitan sync finished with failures. Check Audit for details.");
        return;
      }

      toast.success("ServiceTitan reference data synced.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to sync ServiceTitan references.");
    } finally {
      setRunningScope(null);
    }
  };

  return (
    <div className="flex flex-wrap gap-3">
      <Button type="button" onClick={() => runSync("ALL")} disabled={disabled || Boolean(runningScope)}>
        {runningScope === "ALL" ? "Syncing..." : "Sync locations + services"}
      </Button>
      <Button type="button" variant="outline" onClick={() => runSync("LOCATIONS")} disabled={disabled || Boolean(runningScope)}>
        {runningScope === "LOCATIONS" ? "Syncing..." : "Sync locations"}
      </Button>
      <Button type="button" variant="outline" onClick={() => runSync("SERVICES")} disabled={disabled || Boolean(runningScope)}>
        {runningScope === "SERVICES" ? "Syncing..." : "Sync services"}
      </Button>
    </div>
  );
}

