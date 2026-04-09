import type { OperatorIssueSeverity, OperatorIssueStatus, OperatorIssueType } from "@prisma/client";

export const operatorIssueTypeLabels: Record<OperatorIssueType, string> = {
  LEAD_SYNC_FAILURE: "Lead sync failure",
  UNMAPPED_LEAD: "Unmapped lead",
  CRM_SYNC_FAILURE: "CRM sync failure",
  AUTORESPONDER_FAILURE: "Autoresponder failure",
  REPORT_DELIVERY_FAILURE: "Report delivery failure",
  MAPPING_CONFLICT: "Mapping conflict",
  STALE_LEAD: "Stale lead"
};

export function getUnmappedLeadSeverity(createdAt: Date, now = new Date()): OperatorIssueSeverity {
  const ageHours = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60);

  if (ageHours >= 72) {
    return "HIGH";
  }

  if (ageHours >= 24) {
    return "MEDIUM";
  }

  return "LOW";
}

export function getStaleLeadSeverity(referenceAt: Date, now = new Date()): OperatorIssueSeverity {
  const ageDays = (now.getTime() - referenceAt.getTime()) / (1000 * 60 * 60 * 24);

  if (ageDays >= 7) {
    return "HIGH";
  }

  return "MEDIUM";
}

export function getIssueStatusActionability(status: OperatorIssueStatus) {
  return status === "OPEN";
}

export function isRetryableIssueType(issueType: OperatorIssueType) {
  return (
    issueType === "LEAD_SYNC_FAILURE" ||
    issueType === "CRM_SYNC_FAILURE" ||
    issueType === "AUTORESPONDER_FAILURE" ||
    issueType === "REPORT_DELIVERY_FAILURE"
  );
}

export function getRetryLabel(issueType: OperatorIssueType) {
  switch (issueType) {
    case "LEAD_SYNC_FAILURE":
      return "Retry intake";
    case "CRM_SYNC_FAILURE":
      return "Retry partner sync";
    case "AUTORESPONDER_FAILURE":
      return "Retry autoresponder";
    case "REPORT_DELIVERY_FAILURE":
      return "Retry delivery";
    default:
      return "Retry";
  }
}

export function getIssueRemapHref(params: { issueType: OperatorIssueType; leadId?: string | null }) {
  if (!params.leadId) {
    return null;
  }

  if (
    params.issueType === "UNMAPPED_LEAD" ||
    params.issueType === "MAPPING_CONFLICT" ||
    params.issueType === "CRM_SYNC_FAILURE"
  ) {
    return `/leads/${params.leadId}`;
  }

  return null;
}

export function buildOperatorIssueSummary(
  issues: Array<{
    status: OperatorIssueStatus;
    severity: OperatorIssueSeverity;
    issueType: OperatorIssueType;
  }>
) {
  const openIssues = issues.filter((issue) => issue.status === "OPEN");

  return {
    total: issues.length,
    open: openIssues.length,
    highSeverity: openIssues.filter((issue) => issue.severity === "HIGH" || issue.severity === "CRITICAL").length,
    retryableOpen: openIssues.filter((issue) => isRetryableIssueType(issue.issueType)).length,
    deliveryFailures: openIssues.filter((issue) => issue.issueType === "REPORT_DELIVERY_FAILURE").length,
    unmappedLeads: openIssues.filter((issue) => issue.issueType === "UNMAPPED_LEAD").length,
    staleLeads: openIssues.filter((issue) => issue.issueType === "STALE_LEAD").length
  };
}
