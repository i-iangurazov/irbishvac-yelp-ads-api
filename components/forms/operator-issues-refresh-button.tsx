"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/utils/client-api";

export function OperatorIssuesRefreshButton() {
  const router = useRouter();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function refreshIssues() {
    setIsRefreshing(true);
    setMessage(null);

    try {
      await apiFetch("/api/issues/refresh", {
        method: "POST",
      });
      setMessage("Issue queue refreshed.");
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to refresh issues.",
      );
    } finally {
      setIsRefreshing(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1 sm:items-end">
      <Button
        type="button"
        variant="outline"
        onClick={refreshIssues}
        disabled={isRefreshing}
      >
        <RefreshCw
          className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`}
        />
        {isRefreshing ? "Refreshing" : "Refresh issues"}
      </Button>
      {message ? (
        <div className="max-w-48 text-xs text-muted-foreground">{message}</div>
      ) : null}
    </div>
  );
}
