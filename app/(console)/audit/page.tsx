import Link from "next/link";
import type { Route } from "next";

import { OperatorIssuesFilterForm } from "@/components/forms/operator-issues-filter-form";
import { OperatorIssuesTable } from "@/components/forms/operator-issues-table";
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
import { getOperationalPilotOverview } from "@/features/operations/observability-service";
import { getAuditSyncOverview, getAuditWebhookOverview, getAuditWorkerJobOverview } from "@/features/operations/service";
import { requireUser } from "@/lib/auth/service";
import { formatDateTime, titleCase } from "@/lib/utils/format";

function formatAuditAction(actionType: string) {
  return titleCase(actionType.replaceAll(".", " ").replaceAll("/", " "));
}

function buildAuditQuery(values: Record<string, string | number | null | undefined>) {
  const query: Record<string, string> = {};

  for (const [key, value] of Object.entries(values)) {
    if (value === null || value === undefined || value === "") {
      continue;
    }

    query[key] = String(value);
  }

  return {
    pathname: "/audit",
    query
  };
}

function formatLagMinutes(valueMs: number) {
  if (valueMs <= 0) {
    return "0 min";
  }

  return `${Math.round(valueMs / 60000)} min`;
}

function formatAge(from: Date, now = new Date()) {
  const ageMs = Math.max(0, now.getTime() - from.getTime());
  const minutes = Math.round(ageMs / 60000);

  if (minutes < 60) {
    return `${minutes} min`;
  }

  const hours = Math.round(minutes / 60);
  return `${hours} hr`;
}

function getWebhookBusinessLabel(event: Awaited<ReturnType<typeof getAuditWebhookOverview>>["attentionEvents"][number]) {
  return event.lead?.business?.name ?? event.lead?.externalBusinessId ?? "Unknown business";
}

function getWebhookLeadLabel(event: Awaited<ReturnType<typeof getAuditWebhookOverview>>["attentionEvents"][number]) {
  if (!event.lead) {
    return "Lead not linked";
  }

  return event.lead.customerName ?? event.lead.externalLeadId;
}

function getWebhookErrorSummary(event: Awaited<ReturnType<typeof getAuditWebhookOverview>>["attentionEvents"][number]) {
  const errorJson = typeof event.errorJson === "object" && event.errorJson !== null ? event.errorJson as Record<string, unknown> : null;
  const webhookError = typeof errorJson?.message === "string" ? errorJson.message : null;

  return event.syncRun?.errorSummary ?? webhookError ?? (event.syncRun?._count.errors ? `${event.syncRun._count.errors} sync errors` : "No error summary");
}

function formatWorkerKind(kind: string) {
  return titleCase(kind.replaceAll("INTERNAL_RECONCILE_", "").replaceAll("_", " ").toLowerCase());
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
    page?: string;
  }>;
}) {
  const user = await requireUser();
  const filters = await searchParams;
  const [events, syncOverview, webhookOverview, workerJobOverview, issueQueue, pilotOverview] = await Promise.all([
    getAuditLog(user.tenantId, { take: 50 }),
    getAuditSyncOverview(user.tenantId),
    getAuditWebhookOverview(user.tenantId),
    getAuditWorkerJobOverview(user.tenantId),
    getOperatorQueue(user.tenantId, filters as OperatorIssueFiltersInput),
    getOperationalPilotOverview(user.tenantId)
  ]);
  const failedEvents = events.filter((event) => event.status === "FAILED").length;
  const syncFailures = syncOverview.recentSyncRuns.filter((syncRun) => syncRun.status === "FAILED" || syncRun.status === "PARTIAL").length;
  const oldestPendingAgeMs = webhookOverview.oldestPending
    ? Date.now() - webhookOverview.oldestPending.receivedAt.getTime()
    : 0;

  return (
    <div>
      <PageHeader
        title="Audit"
        description="Work the operator queue first. Audit trail and pilot telemetry are supporting evidence."
        actions={<Badge variant="outline">Operator queue</Badge>}
      />

      <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="Open issues" value={issueQueue.summary.open} description="Current operator workload after issue refresh." />
        <MetricCard title="High severity" value={issueQueue.summary.highSeverity} description="Open issues marked high or critical." />
        <MetricCard title="Retry ready" value={issueQueue.summary.retryableOpen} description="Open issues with a safe retry path." />
        <MetricCard title="Unmapped leads" value={issueQueue.summary.unmappedLeads} description="Leads still waiting for a CRM link." />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Operator queue</CardTitle>
          <CardDescription>System-generated issues normalized across lead intake, CRM enrichment, automation, and report delivery.</CardDescription>
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
            <>
              <OperatorIssuesTable
                issues={issueQueue.issues.map((issue) => ({
                  id: issue.id,
                  typeLabel: issue.typeLabel,
                  summary: issue.summary,
                  businessName: issue.business?.name ?? issue.location?.name ?? "Tenant-wide",
                  targetLabel: issue.targetLabel,
                  severity: issue.severity,
                  status: issue.status,
                  retryable: issue.retryable,
                  actionable: issue.actionable,
                  retryLabel: issue.retryLabel,
                  remapHref: issue.remapHref ?? null,
                  firstDetectedLabel: formatDateTime(issue.firstDetectedAt),
                  lastDetectedLabel: formatDateTime(issue.lastDetectedAt)
                }))}
              />
              {issueQueue.pagination.totalPages > 1 ? (
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/70 pt-4 text-sm text-muted-foreground">
                  <span>
                    Page {issueQueue.pagination.currentPage} of {issueQueue.pagination.totalPages} •{" "}
                    {issueQueue.pagination.filteredTotal} matching issues
                  </span>
                  <div className="flex gap-2">
                    <Link
                      className={`rounded-md px-3 py-1 ${
                        issueQueue.pagination.hasPreviousPage
                          ? "border border-border/70 hover:bg-muted/30"
                          : "pointer-events-none opacity-50"
                      }`}
                      href={buildAuditQuery({
                        ...issueQueue.filters,
                        page: issueQueue.pagination.currentPage - 1
                      })}
                    >
                      Previous
                    </Link>
                    <Link
                      className={`rounded-md px-3 py-1 ${
                        issueQueue.pagination.hasNextPage
                          ? "border border-border/70 hover:bg-muted/30"
                          : "pointer-events-none opacity-50"
                      }`}
                      href={buildAuditQuery({
                        ...issueQueue.filters,
                        page: issueQueue.pagination.currentPage + 1
                      })}
                    >
                      Next
                    </Link>
                  </div>
                </div>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>

      <Card className="mt-6 border-border/70 bg-muted/10">
        <CardHeader>
          <CardTitle>Pilot monitoring</CardTitle>
          <CardDescription>Compact signals for queue growth, webhook lag, automation safety, and rollout posture.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
            <MetricCard
              title="Webhooks 24h"
              value={pilotOverview.windows.last24h.webhookAccepted}
              description={`${pilotOverview.windows.last24h.webhookDuplicates} duplicates ignored`}
            />
            <MetricCard
              title="Webhook lag"
              value={formatLagMinutes(pilotOverview.windows.last24h.webhookAvgLagMs)}
              description={`${pilotOverview.windows.last24h.webhookFailed} failed reconciles in 24h`}
            />
            <MetricCard
              title="Automation sent"
              value={pilotOverview.windows.last24h.automationSent}
              description={`${pilotOverview.windows.last24h.automationFailed} failed sends in 24h`}
            />
            <MetricCard
              title="Conversation handoffs"
              value={pilotOverview.windows.last7d.conversationHandoffs}
              description={`${pilotOverview.windows.last7d.handoffRate}% of bounded conversation decisions`}
            />
            <MetricCard
              title="Issue growth"
              value={pilotOverview.windows.last24h.issueCreated}
              description={`${pilotOverview.windows.last24h.issueReopened} reopened in 24h`}
            />
            <MetricCard
              title="Report delivery"
              value={`${pilotOverview.windows.last7d.reportDeliverySuccessRate}%`}
              description={`${pilotOverview.windows.last7d.reportDeliveryFailures} delivery failures in 7d`}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border/80 bg-background/80 px-4 py-3 text-xs text-muted-foreground">
            <span>{pilotOverview.queue.openIssues} issues open now</span>
            <span className="text-border">•</span>
            <span>{pilotOverview.queue.highSeverity} high severity</span>
            <span className="text-border">•</span>
            <span>{pilotOverview.windows.last7d.lowConfidence} low-confidence conversation stops</span>
            <span className="text-border">•</span>
            <span>{pilotOverview.windows.last7d.maxTurnHits} max-turn stops</span>
            <span className="text-border">•</span>
            <span>{pilotOverview.windows.last24h.serviceTitanFailures} ServiceTitan failures in 24h</span>
          </div>

          <div className="overflow-hidden rounded-2xl border border-border/70">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Business</TableHead>
                  <TableHead>Rollout</TableHead>
                  <TableHead>Conversation</TableHead>
                  <TableHead>Proof</TableHead>
                  <TableHead>Issues</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pilotOverview.rolloutPosture.length > 0 ? (
                  pilotOverview.rolloutPosture.map((business) => (
                    <TableRow key={business.businessId}>
                      <TableCell>
                        <div className="font-medium text-foreground">{business.businessName}</div>
                        <div className="text-xs text-muted-foreground">{titleCase(business.scopeSource.replaceAll("_", " "))}</div>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium text-foreground">{business.rolloutLabel}</div>
                        <div className="text-xs text-muted-foreground">{business.rolloutStateLabel}</div>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium text-foreground">{business.conversationModeLabel}</div>
                        <div className="text-xs text-muted-foreground">{business.aiModelLabel}</div>
                      </TableCell>
                      <TableCell>
                        {business.proofOfSend ? <StatusChip status="READY" /> : <span className="text-xs text-muted-foreground">Waiting for first live send</span>}
                      </TableCell>
                      <TableCell>{business.openIssueCount}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell className="text-sm text-muted-foreground" colSpan={5}>
                      No business rollout posture is available yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Webhook and reconcile drilldown</CardTitle>
          <CardDescription>Event-level intake status, backlog age, linked lead, and recovery context.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              title="Queued"
              value={webhookOverview.counts.queued}
              description={`${webhookOverview.counts.processing} currently processing`}
            />
            <MetricCard
              title="Oldest pending"
              value={formatLagMinutes(oldestPendingAgeMs)}
              description={webhookOverview.oldestPending ? `Status ${webhookOverview.oldestPending.status}` : "No pending webhook work"}
            />
            <MetricCard
              title="Failed 24h"
              value={webhookOverview.counts.failedLast24h}
              description={`${webhookOverview.counts.failed} failed total, ${webhookOverview.counts.partial} partial total`}
            />
            <MetricCard
              title="Completed"
              value={webhookOverview.counts.completed}
              description={`${webhookOverview.counts.skipped} skipped webhook events`}
            />
          </div>

          <div className="overflow-hidden rounded-2xl border border-border/70">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Received</TableHead>
                  <TableHead>Business</TableHead>
                  <TableHead>Lead</TableHead>
                  <TableHead>Event key</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Sync run</TableHead>
                  <TableHead>Issue</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {webhookOverview.attentionEvents.length > 0 ? (
                  webhookOverview.attentionEvents.map((event) => (
                    <TableRow key={event.id}>
                      <TableCell>
                        <div>{formatDateTime(event.receivedAt)}</div>
                        <div className="text-xs text-muted-foreground">{formatAge(event.receivedAt)} old</div>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{getWebhookBusinessLabel(event)}</div>
                        {event.lead?.business?.encryptedYelpBusinessId ?? event.lead?.externalBusinessId ? (
                          <div className="text-xs text-muted-foreground">
                            {event.lead?.business?.encryptedYelpBusinessId ?? event.lead?.externalBusinessId}
                          </div>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        {event.lead ? (
                          <Link className="font-medium hover:underline" href={`/leads/${event.lead.id}` as Route}>
                            {getWebhookLeadLabel(event)}
                          </Link>
                        ) : (
                          <span className="text-sm text-muted-foreground">Not linked</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="max-w-[180px] truncate font-mono text-xs">{event.eventKey}</div>
                        {event.deliveryId ? <div className="max-w-[180px] truncate text-xs text-muted-foreground">{event.deliveryId}</div> : null}
                      </TableCell>
                      <TableCell>
                        <StatusChip status={event.status} />
                      </TableCell>
                      <TableCell>
                        {event.syncRun ? (
                          <div className="space-y-1">
                            <div className="text-sm">{event.syncRun.type}</div>
                            <StatusChip status={event.syncRun.status} />
                          </div>
                        ) : (
                          <span className="text-sm text-muted-foreground">No sync run</span>
                        )}
                      </TableCell>
                      <TableCell className="max-w-[280px] text-sm text-muted-foreground">
                        {getWebhookErrorSummary(event)}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell className="text-sm text-muted-foreground" colSpan={7}>
                      No stale, failed, or partial webhook events need operator attention.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card className="mt-6 border-border/70 bg-muted/10">
        <CardHeader>
          <CardTitle>Worker durability</CardTitle>
          <CardDescription>Leased cron workers, retries, and dead-lettered jobs that need operator attention.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              title="Active workers"
              value={workerJobOverview.counts.claimed + workerJobOverview.counts.processing}
              description={`${workerJobOverview.counts.queued} queued jobs`}
            />
            <MetricCard
              title="Failed"
              value={workerJobOverview.counts.failed}
              description="Waiting for backoff or next safe retry."
            />
            <MetricCard
              title="Dead-lettered"
              value={workerJobOverview.counts.deadLettered}
              description="Stopped after repeated failures."
            />
            <MetricCard
              title="Recent jobs"
              value={workerJobOverview.recentJobs.length}
              description={`${workerJobOverview.counts.succeeded} currently healthy job keys`}
            />
          </div>

          <div className="overflow-hidden rounded-2xl border border-border/70">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Worker</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Attempts</TableHead>
                  <TableHead>Updated</TableHead>
                  <TableHead>Last issue</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(workerJobOverview.attentionJobs.length > 0 ? workerJobOverview.attentionJobs : workerJobOverview.recentJobs).length > 0 ? (
                  (workerJobOverview.attentionJobs.length > 0 ? workerJobOverview.attentionJobs : workerJobOverview.recentJobs).map((job) => (
                    <TableRow key={job.id}>
                      <TableCell>
                        <div className="font-medium text-foreground">{formatWorkerKind(job.kind)}</div>
                        <div className="max-w-[220px] truncate font-mono text-xs text-muted-foreground">{job.jobKey}</div>
                      </TableCell>
                      <TableCell>
                        <StatusChip status={job.status} />
                      </TableCell>
                      <TableCell>
                        {job.attempts}/{job.maxAttempts}
                      </TableCell>
                      <TableCell>{formatDateTime(job.updatedAt)}</TableCell>
                      <TableCell className="max-w-[320px] text-sm text-muted-foreground">
                        {job.lastErrorSummary ?? (job.deadLetteredAt ? "Dead-lettered without error detail" : "No current issue")}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell className="text-sm text-muted-foreground" colSpan={5}>
                      No durable worker jobs have run yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.95fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Recent events</CardTitle>
            <CardDescription>Manual actions and system outcomes across the console.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 p-0">
            <div className="flex flex-wrap items-center gap-2 px-6 pt-4 text-xs text-muted-foreground">
              <span>{events.length} recent events</span>
              <span className="text-border">•</span>
              <span>{failedEvents} failed</span>
            </div>
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

        <Card className="border-border/70 bg-muted/10">
          <CardHeader>
            <CardTitle>Operational sync log</CardTitle>
            <CardDescription>Background executions for reporting, leads, CRM, and enrichment work.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 p-0">
            <div className="flex flex-wrap items-center gap-2 px-6 pt-4 text-xs text-muted-foreground">
              <span>{syncOverview.recentSyncRuns.length} sync runs</span>
              <span className="text-border">•</span>
              <span>{syncFailures} sync issues</span>
            </div>
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
    </div>
  );
}
