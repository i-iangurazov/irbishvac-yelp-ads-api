import Link from "next/link";

import { OperatorIssuesFilterForm } from "@/components/forms/operator-issues-filter-form";
import { EmptyState } from "@/components/shared/empty-state";
import { MetricCard } from "@/components/shared/metric-card";
import { PageHeader } from "@/components/shared/page-header";
import { StatusChip } from "@/components/shared/status-chip";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getAuditLog } from "@/features/audit/service";
import type { OperatorIssueFiltersInput } from "@/features/issues/schemas";
import { getOperatorQueue } from "@/features/issues/service";
import { getAuditSyncOverview } from "@/features/operations/service";
import { requireUser } from "@/lib/auth/service";
import { formatDateTime, titleCase } from "@/lib/utils/format";

function formatAuditAction(actionType: string) {
  return titleCase(actionType.replaceAll(".", " ").replaceAll("/", " "));
}

export default async function AuditPage({
  searchParams
}: {
  searchParams: Promise<{
    issueType?: string;
    businessId?: string;
    locationId?: string;
    severity?: string;
    status?: string;
    age?: string;
  }>;
}) {
  const user = await requireUser();
  const filters = await searchParams;
  const [events, syncOverview, issueQueue] = await Promise.all([
    getAuditLog(user.tenantId),
    getAuditSyncOverview(user.tenantId),
    getOperatorQueue(user.tenantId, filters as OperatorIssueFiltersInput)
  ]);
  const failedEvents = events.filter((event) => event.status === "FAILED").length;
  const syncFailures = syncOverview.recentSyncRuns.filter((syncRun) => syncRun.status === "FAILED" || syncRun.status === "PARTIAL").length;

  return (
    <div>
      <PageHeader
        title="Audit"
        description="Open issues first, audit trail second."
        actions={<Badge variant="outline">Operator queue</Badge>}
      />

      <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="Open issues" value={issueQueue.summary.open} description="Current operator workload after issue refresh." />
        <MetricCard title="High severity" value={issueQueue.summary.highSeverity} description="Open issues marked high or critical." />
        <MetricCard title="Delivery failures" value={issueQueue.summary.deliveryFailures} description="Recurring report runs still failing." />
        <MetricCard title="Unmapped leads" value={issueQueue.summary.unmappedLeads} description="Leads still waiting for a CRM link." />
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-2 rounded-2xl border border-border/80 bg-muted/15 px-4 py-3 text-xs text-muted-foreground">
        <span>{events.length} recent events</span>
        <span className="text-border">•</span>
        <span>{failedEvents} failed events</span>
        <span className="text-border">•</span>
        <span>{syncOverview.recentSyncRuns.length} sync runs</span>
        <span className="text-border">•</span>
        <span>{syncFailures} sync issues</span>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Operator queue</CardTitle>
          <CardDescription>System-generated issues normalized across lead intake, CRM enrichment, autoresponder, and report delivery.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <OperatorIssuesFilterForm
            businesses={issueQueue.options.businesses}
            locations={issueQueue.options.locations}
            values={issueQueue.filters}
          />

          {issueQueue.issues.length === 0 ? (
            <EmptyState
              title="No issues match the current filters"
              description="When lead, CRM, reporting, or automation conditions need action, they will appear here as operator issues."
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Issue</TableHead>
                    <TableHead>Target</TableHead>
                    <TableHead>Severity</TableHead>
                    <TableHead>Detected</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Next step</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {issueQueue.issues.map((issue) => (
                    <TableRow key={issue.id}>
                      <TableCell>
                        <Link className="font-medium hover:underline" href={`/audit/issues/${issue.id}`}>
                          {issue.typeLabel}
                        </Link>
                        <div className="max-w-[24rem] text-xs text-muted-foreground">{issue.summary}</div>
                      </TableCell>
                      <TableCell>
                        <div>{issue.business?.name ?? issue.location?.name ?? "Tenant-wide"}</div>
                        <div className="text-xs text-muted-foreground">{issue.targetLabel}</div>
                      </TableCell>
                      <TableCell>
                        <StatusChip status={issue.severity} />
                      </TableCell>
                      <TableCell>
                        <div>{formatDateTime(issue.firstDetectedAt)}</div>
                        <div className="text-xs text-muted-foreground">Last seen {formatDateTime(issue.lastDetectedAt)}</div>
                      </TableCell>
                      <TableCell>
                        <StatusChip status={issue.status} />
                      </TableCell>
                      <TableCell>
                        {issue.retryable && issue.actionable ? (
                          <span className="text-xs text-muted-foreground">Retry available</span>
                        ) : issue.remapHref ? (
                          <Link className="text-sm font-medium hover:underline" href={issue.remapHref as `/leads/${string}`}>
                            Remap in lead workspace
                          </Link>
                        ) : (
                          <span className="text-xs text-muted-foreground">Review detail</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Recent events</CardTitle>
          <CardDescription>Manual actions and system outcomes across the console.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Target</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {events.map((event) => (
                <TableRow key={event.id}>
                  <TableCell>{formatDateTime(event.createdAt)}</TableCell>
                  <TableCell>{event.actor?.name ?? "System"}</TableCell>
                  <TableCell>{formatAuditAction(event.actionType)}</TableCell>
                  <TableCell>
                    {event.program ? `${event.program.type} program` : event.business?.name ?? (event.reportRequest ? `${event.reportRequest.granularity} report` : "Tenant-wide")}
                  </TableCell>
                  <TableCell><StatusChip status={event.status} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card className="mt-6 border-border/70 bg-muted/10">
        <CardHeader>
          <CardTitle>Operational sync log</CardTitle>
          <CardDescription>Background executions for reporting, leads, CRM, and future enrichment work.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Started</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Issues</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {syncOverview.recentSyncRuns.map((syncRun) => (
                <TableRow key={syncRun.id}>
                  <TableCell>{formatDateTime(syncRun.startedAt)}</TableCell>
                  <TableCell>{syncRun.type}</TableCell>
                  <TableCell>
                    <StatusChip status={syncRun.status} />
                  </TableCell>
                  <TableCell>{syncRun._count.errors}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
