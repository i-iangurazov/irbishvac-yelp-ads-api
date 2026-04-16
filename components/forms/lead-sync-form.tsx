"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { apiFetch } from "@/lib/utils/client-api";

type LeadBackfillRunStatus = {
  syncRunId: string;
  status: string;
  businessId: string | null;
  businessName: string;
  importedCount: number;
  updatedCount: number;
  failedCount: number;
  returnedLeadIds: number;
  hasMore: boolean;
  pagesFetched: number;
  pageSize: number;
  pageLimit: number;
  processingMs: number | null;
  errorSummary: string | null;
  progressLabel: string;
};

export function LeadSyncForm({
  businesses,
  defaultBusinessId,
  capabilityEnabled
}: {
  businesses: Array<{ id: string; name: string }>;
  defaultBusinessId?: string;
  capabilityEnabled: boolean;
}) {
  const router = useRouter();
  const initialBusinessId = useMemo(
    () => (defaultBusinessId && businesses.some((business) => business.id === defaultBusinessId) ? defaultBusinessId : businesses[0]?.id ?? ""),
    [businesses, defaultBusinessId]
  );
  const [businessId, setBusinessId] = useState(initialBusinessId);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [progress, setProgress] = useState<LeadBackfillRunStatus | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [processError, setProcessError] = useState<string | null>(null);

  useEffect(() => {
    if (!progress || !dialogOpen) {
      return;
    }

    if (!["QUEUED", "PROCESSING"].includes(progress.status)) {
      return;
    }

    let cancelled = false;
    const poll = async () => {
      try {
        const next = await apiFetch<LeadBackfillRunStatus>(`/api/leads/sync/runs/${progress.syncRunId}`);

        if (cancelled) {
          return;
        }

        setProgress(next);

        if (!["QUEUED", "PROCESSING"].includes(next.status)) {
          router.refresh();

          if (next.status === "COMPLETED") {
            toast.success(
              `Backfill completed for ${next.businessName}: ${next.importedCount} new, ${next.updatedCount} refreshed.`
            );
          } else if (next.status === "PARTIAL") {
            toast.warning(
              `Backfill finished partially for ${next.businessName}: ${next.importedCount} new, ${next.updatedCount} refreshed, ${next.failedCount} failed.`
            );
          } else {
            toast.error(next.errorSummary ?? `Backfill failed for ${next.businessName}.`);
          }
        }
      } catch (error) {
        if (cancelled) {
          return;
        }

        setProcessError(error instanceof Error ? error.message : "Unable to refresh backfill progress.");
      }
    };

    void poll();
    const interval = window.setInterval(() => {
      void poll();
    }, 1500);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [dialogOpen, progress, router]);

  async function handleSync() {
    if (!businessId) {
      toast.error("Choose a business first.");
      return;
    }

    try {
      setIsSubmitting(true);
      setProcessError(null);

      const run = await apiFetch<{
        syncRunId: string;
        businessId: string;
        businessName: string;
      }>("/api/leads/sync/runs", {
        method: "POST",
        body: JSON.stringify({ businessId })
      });

      setProgress({
        syncRunId: run.syncRunId,
        status: "QUEUED",
        businessId: run.businessId,
        businessName: run.businessName,
        importedCount: 0,
        updatedCount: 0,
        failedCount: 0,
        returnedLeadIds: 0,
        hasMore: false,
        pagesFetched: 0,
        pageSize: 0,
        pageLimit: 0,
        processingMs: null,
        errorSummary: null,
        progressLabel: "Queued"
      });
      setDialogOpen(true);

      void fetch(`/api/leads/sync/runs/${run.syncRunId}/process`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        }
      })
        .then(async (response) => {
          if (response.ok) {
            return;
          }

          const data = await response.json().catch(() => ({}));
          setProcessError(data.message ?? "Unable to process the lead backfill run.");
        })
        .catch((error) => {
          setProcessError(error instanceof Error ? error.message : "Unable to process the lead backfill run.");
        });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to sync Yelp leads.");
    } finally {
      setIsSubmitting(false);
    }
  }

  const isRunActive = progress ? ["QUEUED", "PROCESSING"].includes(progress.status) : false;
  const canCloseDialog = !isRunActive;
  const syncDisabled = !capabilityEnabled || !businessId || isSubmitting || isRunActive;

  return (
    <>
      <div className="flex flex-col gap-3">
        <div className="space-y-1">
          <label className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground" htmlFor="lead-sync-business">
            Yelp business
          </label>
          <select
            className="ui-native-select w-full"
            disabled={!capabilityEnabled || businesses.length === 0 || isSubmitting || isRunActive}
            id="lead-sync-business"
            onChange={(event) => setBusinessId(event.target.value)}
            value={businessId}
          >
            {businesses.length === 0 ? <option value="">No saved businesses</option> : null}
            {businesses.map((business) => (
              <option key={business.id} value={business.id}>
                {business.name}
              </option>
            ))}
          </select>
        </div>
        <Button className="w-full" disabled={syncDisabled} onClick={handleSync} type="button">
          {isSubmitting ? "Starting..." : "Run backfill"}
        </Button>
      </div>

      <Dialog open={dialogOpen} onOpenChange={(open) => (canCloseDialog ? setDialogOpen(open) : undefined)}>
        <DialogContent className="max-w-xl">
            <DialogHeader>
            <DialogTitle>Lead backfill</DialogTitle>
            <DialogDescription>
              {progress
                ? `${progress.businessName} • ${progress.progressLabel}`
                : "Preparing backfill run for the latest 300 Yelp leads..."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-xl border border-border/80 bg-muted/10 px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-medium">
                  {isRunActive ? "Import in progress" : progress?.status === "COMPLETED" ? "Import complete" : "Import finished"}
                </div>
                {isRunActive ? <LoaderCircle className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {processError ?? progress?.progressLabel ?? "Queued"}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-border/80 bg-background px-4 py-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Yelp pages fetched</div>
                <div className="mt-2 text-2xl font-semibold tracking-tight">{progress?.pagesFetched ?? 0}</div>
              </div>
              <div className="rounded-xl border border-border/80 bg-background px-4 py-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Lead IDs scanned</div>
                <div className="mt-2 text-2xl font-semibold tracking-tight">{progress?.returnedLeadIds ?? 0}</div>
              </div>
              <div className="rounded-xl border border-border/80 bg-background px-4 py-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">New leads</div>
                <div className="mt-2 text-2xl font-semibold tracking-tight">{progress?.importedCount ?? 0}</div>
              </div>
              <div className="rounded-xl border border-border/80 bg-background px-4 py-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Refreshed leads</div>
                <div className="mt-2 text-2xl font-semibold tracking-tight">{progress?.updatedCount ?? 0}</div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
              <span>{progress?.failedCount ?? 0} failed</span>
              <span>
                Page size {progress?.pageSize || 20}
                {progress?.hasMore ? " • Older Yelp history exists beyond this 300-lead backfill window" : ""}
              </span>
              {progress?.processingMs ? <span>{Math.round(progress.processingMs / 1000)}s elapsed</span> : null}
            </div>

            <div className="flex justify-end gap-2">
              {canCloseDialog ? (
                <Button onClick={() => setDialogOpen(false)} type="button" variant="outline">
                  Close
                </Button>
              ) : null}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
