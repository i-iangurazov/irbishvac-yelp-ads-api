"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { getBulkActionAvailability, formatBulkActionSummary, type BulkIssueAction } from "@/features/issues/bulk";
import { apiFetch } from "@/lib/utils/client-api";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusChip } from "@/components/shared/status-chip";

type OperatorQueueIssueRow = {
  id: string;
  typeLabel: string;
  summary: string;
  businessName: string;
  targetLabel: string;
  severity: string;
  status: string;
  retryable: boolean;
  actionable: boolean;
  retryLabel: string;
  remapHref: string | null;
  firstDetectedLabel: string;
  lastDetectedLabel: string;
};

type BulkActionResponse = {
  action: BulkIssueAction;
  selected: number;
  succeeded: number;
  failed: number;
  skipped: number;
  results: Array<{
    issueId: string;
    status: "SUCCEEDED" | "FAILED" | "SKIPPED";
    message: string;
  }>;
};

export function OperatorIssuesTable({
  issues
}: {
  issues: OperatorQueueIssueRow[];
}) {
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [activeAction, setActiveAction] = useState<BulkIssueAction | null>(null);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const issueIds = useMemo(() => issues.map((issue) => issue.id), [issues]);
  const issueIdsKey = useMemo(() => issueIds.join(","), [issueIds]);
  const selectedIssues = useMemo(
    () => issues.filter((issue) => selectedIds.includes(issue.id)),
    [issues, selectedIds]
  );
  const availability = useMemo(
    () =>
      getBulkActionAvailability(
        selectedIssues.map((issue) => ({
          id: issue.id,
          status: issue.status as "OPEN" | "RESOLVED" | "IGNORED",
          retryable: issue.retryable,
          actionable: issue.actionable
        }))
      ),
    [selectedIssues]
  );

  useEffect(() => {
    setSelectedIds([]);
    setActiveAction(null);
    setReason("");
    setNote("");
  }, [issueIdsKey]);

  const allSelected = issues.length > 0 && selectedIds.length === issues.length;
  const someSelected = selectedIds.length > 0 && selectedIds.length < issues.length;

  function toggleAll(checked: boolean | "indeterminate") {
    setSelectedIds(checked === true ? issueIds : []);
  }

  function toggleIssue(issueId: string, checked: boolean | "indeterminate") {
    setSelectedIds((current) => {
      if (checked === true) {
        return current.includes(issueId) ? current : [...current, issueId];
      }

      return current.filter((value) => value !== issueId);
    });
  }

  function resetActionState() {
    setActiveAction(null);
    setReason("");
    setNote("");
  }

  async function submitBulkAction(action: BulkIssueAction) {
    if (selectedIds.length === 0) {
      return;
    }

    if ((action === "resolve" || action === "ignore") && reason.trim().length < 2) {
      toast.error("Add a reason before applying the bulk action.");
      return;
    }

    if (action === "note" && note.trim().length < 2) {
      toast.error("Add a note before applying the bulk action.");
      return;
    }

    setIsSubmitting(true);

    try {
      const result = await apiFetch<BulkActionResponse>("/api/issues/bulk", {
        method: "POST",
        body: JSON.stringify({
          action,
          issueIds: selectedIds,
          ...(action === "resolve" || action === "ignore"
            ? {
                reason,
                note
              }
            : action === "note"
              ? {
                  note
                }
              : {})
        })
      });

      const summary = formatBulkActionSummary({
        action: result.action,
        succeeded: result.succeeded,
        failed: result.failed,
        skipped: result.skipped
      });

      if (result.failed > 0) {
        toast.error(summary);
      } else {
        toast.success(summary);
      }

      setSelectedIds([]);
      resetActionState();
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to apply the bulk action.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      {availability.selectedCount > 0 ? (
        <div className="space-y-4 rounded-2xl border border-border/80 bg-muted/10 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm">
              <span className="font-medium">{availability.selectedCount} selected</span>
              <span className="text-muted-foreground"> from the current filtered queue</span>
            </div>
            <button
              className="text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              onClick={() => setSelectedIds([])}
              type="button"
            >
              Clear selection
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              disabled={!availability.canRetry || isSubmitting}
              onClick={() => setActiveAction("retry")}
              size="sm"
              type="button"
              variant={activeAction === "retry" ? "default" : "outline"}
            >
              Retry selected ({availability.retryableCount})
            </Button>
            <Button
              disabled={!availability.canResolve || isSubmitting}
              onClick={() => setActiveAction("resolve")}
              size="sm"
              type="button"
              variant={activeAction === "resolve" ? "default" : "outline"}
            >
              Resolve selected ({availability.actionableCount})
            </Button>
            <Button
              disabled={!availability.canIgnore || isSubmitting}
              onClick={() => setActiveAction("ignore")}
              size="sm"
              type="button"
              variant={activeAction === "ignore" ? "default" : "outline"}
            >
              Ignore selected ({availability.actionableCount})
            </Button>
            <Button
              disabled={!availability.canNote || isSubmitting}
              onClick={() => setActiveAction("note")}
              size="sm"
              type="button"
              variant={activeAction === "note" ? "default" : "outline"}
            >
              Add note to selected
            </Button>
          </div>

          {activeAction ? (
            <div className="grid gap-3 rounded-2xl border border-border/80 bg-background p-4 md:grid-cols-[1fr_auto] md:items-end">
              <div className="space-y-3">
                <div className="text-sm font-medium">
                  {activeAction === "retry"
                    ? "Retry selected issues"
                    : activeAction === "resolve"
                      ? "Resolve selected issues"
                      : activeAction === "ignore"
                        ? "Ignore selected issues"
                        : "Add an internal note"}
                </div>

                {activeAction === "retry" ? (
                  <div className="text-sm text-muted-foreground">
                    Retry will run only for retryable open issues in this selection. Other rows will be skipped automatically.
                  </div>
                ) : null}

                {(activeAction === "resolve" || activeAction === "ignore") ? (
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-1">
                      <Label htmlFor={`bulk-${activeAction}-reason`}>Reason</Label>
                      <Input
                        id={`bulk-${activeAction}-reason`}
                        onChange={(event) => setReason(event.target.value)}
                        placeholder={activeAction === "resolve" ? "Handled in connector workspace" : "Known low-priority issue"}
                        value={reason}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`bulk-${activeAction}-note`}>Note</Label>
                      <Textarea
                        id={`bulk-${activeAction}-note`}
                        onChange={(event) => setNote(event.target.value)}
                        placeholder="Optional operator context for audit history."
                        rows={2}
                        value={note}
                      />
                    </div>
                  </div>
                ) : null}

                {activeAction === "note" ? (
                  <div className="space-y-1">
                    <Label htmlFor="bulk-note">Note</Label>
                    <Textarea
                      id="bulk-note"
                      onChange={(event) => setNote(event.target.value)}
                      placeholder="Record operator context across the selected issues."
                      rows={2}
                      value={note}
                    />
                  </div>
                ) : null}
              </div>

              <div className="flex flex-wrap gap-2">
                <Button disabled={isSubmitting} onClick={() => submitBulkAction(activeAction)} type="button">
                  {isSubmitting ? "Applying..." : "Apply"}
                </Button>
                <Button disabled={isSubmitting} onClick={resetActionState} type="button" variant="ghost">
                  Cancel
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12">
              <Checkbox
                aria-label="Select all filtered issues"
                checked={allSelected ? true : someSelected ? "indeterminate" : false}
                onCheckedChange={toggleAll}
              />
            </TableHead>
            <TableHead>Issue</TableHead>
            <TableHead>Target</TableHead>
            <TableHead>Severity</TableHead>
            <TableHead>Detected</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Next step</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {issues.map((issue) => {
            const selected = selectedIds.includes(issue.id);

            return (
              <TableRow className={selected ? "bg-muted/20" : undefined} key={issue.id}>
                <TableCell className="w-12">
                  <Checkbox
                    aria-label={`Select ${issue.typeLabel}`}
                    checked={selected}
                    onCheckedChange={(checked) => toggleIssue(issue.id, checked)}
                  />
                </TableCell>
                <TableCell>
                  <Link className="font-medium hover:underline" href={`/audit/issues/${issue.id}`}>
                    {issue.typeLabel}
                  </Link>
                  <div className="max-w-[24rem] text-xs text-muted-foreground">{issue.summary}</div>
                </TableCell>
                <TableCell>
                  <div>{issue.businessName}</div>
                  <div className="text-xs text-muted-foreground">{issue.targetLabel}</div>
                </TableCell>
                <TableCell>
                  <StatusChip status={issue.severity} />
                </TableCell>
                <TableCell>
                  <div>{issue.firstDetectedLabel}</div>
                  <div className="text-xs text-muted-foreground">Last seen {issue.lastDetectedLabel}</div>
                </TableCell>
                <TableCell>
                  <StatusChip status={issue.status} />
                </TableCell>
                <TableCell>
                  {issue.retryable && issue.actionable ? (
                    <span className="text-xs text-muted-foreground">{issue.retryLabel}</span>
                  ) : issue.remapHref ? (
                    <Link className="text-sm font-medium hover:underline" href={issue.remapHref as `/leads/${string}`}>
                      Remap in lead workspace
                    </Link>
                  ) : (
                    <span className="text-xs text-muted-foreground">Review detail</span>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
