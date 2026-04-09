import Link from "next/link";

import { OperatorIssueNoteForm } from "@/components/forms/operator-issue-note-form";
import { OperatorIssueResolutionForm } from "@/components/forms/operator-issue-resolution-form";
import { OperatorIssueRetryButton } from "@/components/forms/operator-issue-retry-button";
import { AuditTimeline } from "@/components/shared/audit-timeline";
import { JsonViewer } from "@/components/shared/json-viewer";
import { PageHeader } from "@/components/shared/page-header";
import { StatusChip } from "@/components/shared/status-chip";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getOperatorIssueDetail } from "@/features/issues/service";
import { requireUser } from "@/lib/auth/service";
import { formatDateTime } from "@/lib/utils/format";

export default async function OperatorIssueDetailPage({
  params
}: {
  params: Promise<{ issueId: string }>;
}) {
  const user = await requireUser();
  const { issueId } = await params;
  const detail = await getOperatorIssueDetail(user.tenantId, issueId);
  const issue = detail.issue;

  return (
    <div>
      <PageHeader
        title={detail.typeLabel}
        description={issue.summary}
        actions={
          <div className="flex flex-wrap gap-2">
            <StatusChip status={issue.status} />
            <StatusChip status={issue.severity} />
            <Badge variant="outline">{issue.sourceSystem}</Badge>
          </div>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Issue summary</CardTitle>
              <CardDescription>What failed, why it matters, and which record is linked to the exception.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm md:grid-cols-2">
              <div>
                <div className="text-muted-foreground">Type</div>
                <div>{detail.typeLabel}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Status</div>
                <StatusChip status={issue.status} />
              </div>
              <div>
                <div className="text-muted-foreground">Severity</div>
                <StatusChip status={issue.severity} />
              </div>
              <div>
                <div className="text-muted-foreground">Source system</div>
                <div>{issue.sourceSystem}</div>
              </div>
              <div>
                <div className="text-muted-foreground">First detected</div>
                <div>{formatDateTime(issue.firstDetectedAt)}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Last detected</div>
                <div>{formatDateTime(issue.lastDetectedAt)}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Resolution</div>
                <div>{issue.resolutionReason ?? "Not resolved"}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Detected count</div>
                <div>{issue.detectedCount}</div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Linked records</CardTitle>
              <CardDescription>Jump into the relevant workspace to resolve source data where possible.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              {issue.business ? (
                <div className="rounded-xl border border-border/80 p-4">
                  <div className="text-muted-foreground">Business</div>
                  <Link className="font-medium hover:underline" href={`/businesses/${issue.business.id}`}>
                    {issue.business.name}
                  </Link>
                </div>
              ) : null}

              {issue.lead ? (
                <div className="rounded-xl border border-border/80 p-4">
                  <div className="text-muted-foreground">Lead</div>
                  <div className="font-medium">{issue.lead.customerName ?? issue.lead.externalLeadId}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Yelp lead {issue.lead.externalLeadId}
                  </div>
                  <div className="mt-3 flex gap-2">
                    <Link className="text-sm font-medium hover:underline" href={`/leads/${issue.lead.id}`}>
                      Open lead
                    </Link>
                    {detail.remapHref ? (
                      <Link className="text-sm font-medium hover:underline" href={detail.remapHref as `/leads/${string}`}>
                        Remap
                      </Link>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {issue.reportScheduleRun ? (
                <div className="rounded-xl border border-border/80 p-4">
                  <div className="text-muted-foreground">Report run</div>
                  <div className="font-medium">{issue.reportScheduleRun.schedule.name}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {issue.reportScheduleRun.scope} • Scheduled {formatDateTime(issue.reportScheduleRun.scheduledFor)}
                  </div>
                  {issue.reportScheduleRun.reportRequestId ? (
                    <div className="mt-3">
                      <Link
                        className="text-sm font-medium hover:underline"
                        href={`/reporting/${issue.reportScheduleRun.reportRequestId}`}
                      >
                        Open report
                      </Link>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {issue.syncRun ? (
                <div className="rounded-xl border border-border/80 p-4">
                  <div className="text-muted-foreground">Sync run</div>
                  <div className="flex items-center gap-2">
                    <div className="font-medium">{issue.syncRun.type}</div>
                    <StatusChip status={issue.syncRun.status} />
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Started {formatDateTime(issue.syncRun.startedAt)}
                  </div>
                  {issue.syncRun.errors[0] ? (
                    <div className="mt-2 text-sm text-muted-foreground">{issue.syncRun.errors[0].message}</div>
                  ) : null}
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Context</CardTitle>
              <CardDescription>Raw normalized issue context from the source record.</CardDescription>
            </CardHeader>
            <CardContent>
              <JsonViewer value={issue.detailsJson} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Issue action log</CardTitle>
              <CardDescription>System-generated and manual actions tied to this issue.</CardDescription>
            </CardHeader>
            <CardContent>
              {detail.auditTrail.length === 0 ? (
                <div className="text-sm text-muted-foreground">No manual actions are recorded for this issue yet.</div>
              ) : (
                <div className="space-y-4">
                  <AuditTimeline events={detail.auditTrail} />
                  {detail.auditTrail.map((event) => (
                    <div className="rounded-xl border border-border/80 p-4" key={`${event.id}-details`}>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{event.actor?.name ?? "System"}</span>
                        <span>•</span>
                        <span>{formatDateTime(event.createdAt)}</span>
                      </div>
                      {event.requestSummaryJson ? (
                        <div className="mt-3">
                          <JsonViewer value={event.requestSummaryJson} />
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Actions</CardTitle>
              <CardDescription>Use only the safe actions this issue type supports.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {detail.retryable && issue.status === "OPEN" ? (
                <div className="rounded-xl border border-border/80 bg-muted/10 p-4">
                  <div className="text-sm font-medium">{detail.retryLabel}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Retries the underlying workflow without creating a new issue type.
                  </div>
                  <div className="mt-3">
                    <OperatorIssueRetryButton issueId={issue.id} label={detail.retryLabel} />
                  </div>
                </div>
              ) : null}

              {detail.remapHref ? (
                <div className="rounded-xl border border-border/80 bg-muted/10 p-4">
                  <div className="text-sm font-medium">Remap in lead workspace</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Use the existing lead detail page to resolve CRM mapping and downstream lifecycle context.
                  </div>
                  <div className="mt-3">
                    <Link className="text-sm font-medium hover:underline" href={detail.remapHref as `/leads/${string}`}>
                      Open lead workspace
                    </Link>
                  </div>
                </div>
              ) : null}

              <div className="rounded-xl border border-border/80 bg-muted/10 p-4">
                <OperatorIssueResolutionForm
                  action="resolve"
                  issueId={issue.id}
                  submitLabel="Mark resolved"
                  title="Resolve issue"
                />
              </div>

              <div className="rounded-xl border border-border/80 bg-muted/10 p-4">
                <OperatorIssueResolutionForm
                  action="ignore"
                  issueId={issue.id}
                  submitLabel="Ignore issue"
                  title="Ignore / dismiss"
                />
              </div>

              <div className="rounded-xl border border-border/80 bg-muted/10 p-4">
                <OperatorIssueNoteForm issueId={issue.id} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Resolution metadata</CardTitle>
              <CardDescription>Current manual resolution state on the issue record.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div>
                <div className="text-muted-foreground">Resolved by</div>
                <div>{issue.resolvedBy?.name ?? "Not resolved"}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Ignored by</div>
                <div>{issue.ignoredBy?.name ?? "Not ignored"}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Resolution note</div>
                <div>{issue.resolutionNote ?? "No resolution note saved."}</div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
