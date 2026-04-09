import type { OperatorIssueStatus } from "@prisma/client";

export type BulkIssueAction = "retry" | "resolve" | "ignore" | "note";

export type BulkIssueSelectionRecord = {
  id: string;
  status: OperatorIssueStatus;
  retryable: boolean;
  actionable: boolean;
};

export function getBulkActionAvailability(issues: BulkIssueSelectionRecord[]) {
  const selectedCount = issues.length;
  const retryableCount = issues.filter((issue) => issue.retryable).length;
  const actionableCount = issues.filter((issue) => issue.actionable).length;

  return {
    selectedCount,
    retryableCount,
    actionableCount,
    canRetry: retryableCount > 0,
    canResolve: actionableCount > 0,
    canIgnore: actionableCount > 0,
    canNote: selectedCount > 0
  };
}

export function formatBulkActionSummary(params: {
  action: BulkIssueAction;
  succeeded: number;
  failed: number;
  skipped: number;
}) {
  const verb =
    params.action === "retry"
      ? "retried"
      : params.action === "resolve"
        ? "resolved"
        : params.action === "ignore"
          ? "ignored"
          : "noted";

  const parts = [`${params.succeeded} ${verb}`];

  if (params.skipped > 0) {
    parts.push(`${params.skipped} skipped`);
  }

  if (params.failed > 0) {
    parts.push(`${params.failed} failed`);
  }

  return parts.join(", ");
}
