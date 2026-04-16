import Link from "next/link";

import { ReportScheduleGenerateButton, ReportScheduleResendButton } from "@/components/forms/report-schedule-actions";
import { ReportScheduleForm } from "@/components/forms/report-schedule-form";
import { ReportRequestForm } from "@/components/forms/report-request-form";
import { EmptyState } from "@/components/shared/empty-state";
import { MetricCard } from "@/components/shared/metric-card";
import { PageHeader } from "@/components/shared/page-header";
import { StatusChip } from "@/components/shared/status-chip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getBusinessesIndex } from "@/features/businesses/service";
import { getServiceTitanLifecycleSyncOverview } from "@/features/crm-connector/lifecycle-service";
import { getLeadConversionSummary } from "@/features/crm-enrichment/service";
import { readLocationRecipientOverridesJson } from "@/features/report-delivery/routing";
import { describeSchedule } from "@/features/report-delivery/schedule";
import { getReportDeliveryAdminState } from "@/features/report-delivery/service";
import { getReportingIndex } from "@/features/reporting/service";
import { requireUser } from "@/lib/auth/service";
import { formatDateTime } from "@/lib/utils/format";

export default async function ReportingPage({
  searchParams
}: {
  searchParams?: Promise<{
    schedule?: string;
    page?: string;
  }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const [reports, businesses, conversionMetrics, deliveryAdminState, lifecycleOverview] = await Promise.all([
    getReportingIndex(user.tenantId, params?.page ? Number(params.page) : 1),
    getBusinessesIndex(user.tenantId),
    getLeadConversionSummary(user.tenantId),
    getReportDeliveryAdminState(user.tenantId, params?.schedule),
    getServiceTitanLifecycleSyncOverview(user.tenantId)
  ]);
  const enabledSchedules = deliveryAdminState.schedules.filter((schedule) => schedule.isEnabled);
  const failedDeliveries = deliveryAdminState.recentRuns.filter((run) => run.deliveryStatus === "FAILED");
  const lastDeliveredRun = [...deliveryAdminState.recentRuns]
    .filter((run) => run.deliveredAt)
    .sort((left, right) => right.deliveredAt!.getTime() - left.deliveredAt!.getTime())[0];
  const latestSnapshotAt = reports.reports
    .map((report) => report.latestResultFetchedAt)
    .filter((value): value is Date => value instanceof Date)
    .sort((left, right) => right.getTime() - left.getTime())[0];

  return (
    <div>
      <PageHeader
        title="Reporting"
        description="Request Yelp batch snapshots, manage recurring delivery, and review reporting health."
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="Ready" value={reports.summary.readyCount} description="Saved requests with at least one ready batch result." />
        <MetricCard title="Waiting on Yelp" value={reports.summary.pendingCount} description="Batch requests still being generated upstream." />
        <MetricCard title="Failed" value={reports.summary.failedCount} description="Requests that need a retry or credential review." />
        <MetricCard title="Last batch" value={latestSnapshotAt ? formatDateTime(latestSnapshotAt) : "Not yet"} description="Most recent stored Yelp reporting snapshot." />
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-2 rounded-2xl border border-border/80 bg-muted/15 px-4 py-3 text-xs text-muted-foreground">
        <Badge>Yelp batch data</Badge>
        <Badge variant="outline">Not real-time</Badge>
        <Badge variant="secondary">CSV export</Badge>
        <span>Results land after Yelp finishes the batch upstream.</span>
      </div>

      <Card className="mt-6 border-border/70 bg-muted/10">
        <CardHeader>
          <CardTitle>Internal conversion foundation</CardTitle>
          <CardDescription>
            Derived from CRM mapping and partner lifecycle records. These metrics are internal-only and do not come from Yelp reporting batches.
            {lifecycleOverview.latestSuccessfulRun
              ? ` Last ServiceTitan lifecycle refresh: ${formatDateTime(lifecycleOverview.latestSuccessfulRun.finishedAt ?? lifecycleOverview.latestSuccessfulRun.startedAt)}.`
              : " No ServiceTitan lifecycle refresh has completed yet."}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3 xl:grid-cols-5">
          <div className="rounded-xl bg-background px-4 py-3">
            <div className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Mapped leads</div>
            <div className="mt-1 text-lg font-semibold">{conversionMetrics.mappedLeads}</div>
          </div>
          <div className="rounded-xl bg-background px-4 py-3">
            <div className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Active</div>
            <div className="mt-1 text-lg font-semibold">{conversionMetrics.activeLeads}</div>
          </div>
          <div className="rounded-xl bg-background px-4 py-3">
            <div className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Contacted</div>
            <div className="mt-1 text-lg font-semibold">{conversionMetrics.contactedLeads}</div>
          </div>
          <div className="rounded-xl bg-background px-4 py-3">
            <div className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Booked</div>
            <div className="mt-1 text-lg font-semibold">{conversionMetrics.bookedLeads}</div>
          </div>
          <div className="rounded-xl bg-background px-4 py-3">
            <div className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Scheduled</div>
            <div className="mt-1 text-lg font-semibold">{conversionMetrics.scheduledJobs}</div>
          </div>
          <div className="rounded-xl bg-background px-4 py-3">
            <div className="text-xs uppercase tracking-[0.14em] text-muted-foreground">In progress</div>
            <div className="mt-1 text-lg font-semibold">{conversionMetrics.jobInProgressJobs}</div>
          </div>
          <div className="rounded-xl bg-background px-4 py-3">
            <div className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Completed</div>
            <div className="mt-1 text-lg font-semibold">{conversionMetrics.completedJobs}</div>
          </div>
          <div className="rounded-xl bg-background px-4 py-3">
            <div className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Won / lost</div>
            <div className="mt-1 text-lg font-semibold">{conversionMetrics.wonLeads} / {conversionMetrics.lostLeads}</div>
          </div>
          <div className="rounded-xl bg-background px-4 py-3">
            <div className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Close rate</div>
            <div className="mt-1 text-lg font-semibold">{conversionMetrics.closeRate}%</div>
          </div>
        </CardContent>
      </Card>

      <div className="mt-6">
        {businesses.length > 0 ? (
          <ReportRequestForm businesses={businesses.map((business) => ({ id: business.id, name: business.name }))} />
        ) : (
          <EmptyState
            title="No businesses available for reporting"
            description="Save at least one business before requesting a Yelp report snapshot."
          />
        )}
      </div>

      <div className="mt-6 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Recurring delivery schedules</CardTitle>
            <CardDescription>Weekly and monthly windows reuse the same saved reporting pipeline and deliver email with CSV attachments.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border/80 bg-muted/15 px-4 py-3 text-xs text-muted-foreground">
              <Badge>Operator delivery</Badge>
              <Badge variant={deliveryAdminState.smtpConfigured ? "success" : "warning"}>
                {deliveryAdminState.smtpConfigured ? "SMTP configured" : "SMTP missing"}
              </Badge>
              <Badge variant="outline">Yelp batch data</Badge>
              <span>
                {deliveryAdminState.smtpConfigured
                  ? "Delivery sends dashboard links and CSV attachments."
                  : "Schedules can still generate runs, but delivery attempts will fail until SMTP is configured."}
              </span>
            </div>

            {deliveryAdminState.schedules.length === 0 ? (
              <EmptyState
                title="No recurring schedules yet"
                description="Create the first weekly or monthly delivery schedule from the form on the right."
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Cadence</TableHead>
                    <TableHead>Recipients</TableHead>
                    <TableHead>Last generation</TableHead>
                    <TableHead>Last sent</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {deliveryAdminState.schedules.map((schedule) => (
                    <TableRow key={schedule.id}>
                      <TableCell>
                        <div className="font-medium">{schedule.name}</div>
                        <div className="text-xs text-muted-foreground">{describeSchedule(schedule)}</div>
                      </TableCell>
                      <TableCell>
                        <div>{schedule.cadence}</div>
                        <div className="text-xs text-muted-foreground">{schedule.deliveryScopeLabel}</div>
                      </TableCell>
                      <TableCell>
                        <div>{schedule.defaultRecipientCount} default</div>
                        <div className="text-xs text-muted-foreground">
                          {schedule.locationOverrideCount > 0 ? `${schedule.locationOverrideCount} location override${schedule.locationOverrideCount === 1 ? "" : "s"}` : "No location overrides"}
                        </div>
                      </TableCell>
                      <TableCell>{schedule.lastSuccessfulGenerationAt ? formatDateTime(schedule.lastSuccessfulGenerationAt) : "Not yet"}</TableCell>
                      <TableCell>{schedule.lastSuccessfulDeliveryAt ? formatDateTime(schedule.lastSuccessfulDeliveryAt) : "Not yet"}</TableCell>
                      <TableCell><StatusChip status={schedule.isEnabled ? "ACTIVE" : "INACTIVE"} /></TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-2">
                          <ReportScheduleGenerateButton scheduleId={schedule.id} />
                          <Button asChild size="sm" variant="ghost">
                            <Link href={`/reporting?schedule=${schedule.id}`}>Edit</Link>
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <ReportScheduleForm
          locations={deliveryAdminState.locations}
          initialValues={
            deliveryAdminState.selectedSchedule
              ? {
                  id: deliveryAdminState.selectedSchedule.id,
                  name: deliveryAdminState.selectedSchedule.name,
                  cadence: deliveryAdminState.selectedSchedule.cadence,
                  deliveryScope: deliveryAdminState.selectedSchedule.deliveryScope,
                  timezone: deliveryAdminState.selectedSchedule.timezone,
                  sendDayOfWeek: deliveryAdminState.selectedSchedule.sendDayOfWeek ?? undefined,
                  sendDayOfMonth: deliveryAdminState.selectedSchedule.sendDayOfMonth ?? undefined,
                  sendHour: deliveryAdminState.selectedSchedule.sendHour,
                  sendMinute: deliveryAdminState.selectedSchedule.sendMinute,
                  deliverPerLocation: deliveryAdminState.selectedSchedule.deliverPerLocation,
                  isEnabled: deliveryAdminState.selectedSchedule.isEnabled,
                  recipientEmails: Array.isArray(deliveryAdminState.selectedSchedule.recipientEmailsJson)
                    ? deliveryAdminState.selectedSchedule.recipientEmailsJson.join("\n")
                    : "",
                  locationRecipientOverrides: readLocationRecipientOverridesJson(
                    deliveryAdminState.selectedSchedule.locationRecipientOverridesJson
                  ).map((override) => ({
                    locationId: override.locationId,
                    recipientEmails: override.recipientEmails.join("\n")
                  }))
                }
              : null
          }
        />
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="Active schedules" value={enabledSchedules.length} description="Recurring report schedules currently enabled." />
        <MetricCard title="Recent delivery runs" value={deliveryAdminState.recentRuns.length} description="Most recent account and location delivery records." />
        <MetricCard title="Failed deliveries" value={failedDeliveries.length} description="Runs that need SMTP or recipient review." />
        <MetricCard title="Last delivery" value={lastDeliveredRun?.deliveredAt ? formatDateTime(lastDeliveredRun.deliveredAt) : "Not yet"} description="Most recent successfully delivered recurring report." />
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Recent delivery runs</CardTitle>
          <CardDescription>Review generation and send state separately. Generation depends on the Yelp batch finishing; delivery depends on SMTP and recipient validity.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {deliveryAdminState.recentRuns.length === 0 ? (
            <div className="p-6">
              <EmptyState title="No delivery runs yet" description="Recurring schedules create persisted delivery runs as soon as the current window is queued." />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Scheduled</TableHead>
                  <TableHead>Schedule</TableHead>
                  <TableHead>Scope</TableHead>
                  <TableHead>Window</TableHead>
                  <TableHead>Generation</TableHead>
                  <TableHead>Delivery</TableHead>
                  <TableHead>Recipients</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {deliveryAdminState.recentRuns.map((run) => (
                    <TableRow key={run.id}>
                    <TableCell>{formatDateTime(run.scheduledFor)}</TableCell>
                    <TableCell>{run.schedule.name}</TableCell>
                    <TableCell>
                      <div>{run.scope === "LOCATION" ? run.location?.name ?? "Unknown location" : "Account rollup"}</div>
                      <div className="text-xs text-muted-foreground">{run.recipientRoutingLabel}</div>
                    </TableCell>
                    <TableCell>{`${formatDateTime(run.windowStart, "MMM d, yyyy")} to ${formatDateTime(run.windowEnd, "MMM d, yyyy")}`}</TableCell>
                    <TableCell><StatusChip status={run.generationStatus} /></TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <StatusChip status={run.deliveryStatus} />
                          {run.errorSummary ? <div className="text-xs text-destructive">{run.errorSummary}</div> : null}
                          {run.primaryIssue ? (
                            <Button asChild className="px-0" size="sm" variant="ghost">
                              <Link href={`/audit/issues/${run.primaryIssue.id}`}>
                                Open issue
                              </Link>
                            </Button>
                          ) : null}
                        </div>
                      </TableCell>
                    <TableCell>
                      {Array.isArray(run.recipientEmailsJson) ? run.recipientEmailsJson.length : 0}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-2">
                        {run.reportRequestId ? (
                          <Button asChild size="sm" variant="ghost">
                            <Link href={`/reporting/${run.reportRequestId}`}>Open batch</Link>
                          </Button>
                        ) : null}
                        {run.generationStatus === "READY" && run.deliveryStatus !== "SKIPPED" ? <ReportScheduleResendButton runId={run.id} /> : null}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Saved report runs</CardTitle>
          <CardDescription>Review request timing, current status, and freshness before using a report operationally.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {reports.reports.length === 0 ? (
            <div className="p-6">
              <EmptyState title="No report runs yet" description="Request the first daily or monthly Yelp batch report from the form above." />
            </div>
          ) : (
            <div className="space-y-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Requested</TableHead>
                    <TableHead>Business scope</TableHead>
                    <TableHead>Window</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Freshness</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reports.reports.map((report) => (
                    <TableRow key={report.id}>
                      <TableCell>{formatDateTime(report.createdAt)}</TableCell>
                      <TableCell>{report.business?.name ?? "Multiple businesses"}</TableCell>
                      <TableCell>{`${report.granularity} • ${formatDateTime(report.startDate, "MMM d, yyyy")} to ${formatDateTime(report.endDate, "MMM d, yyyy")}`}</TableCell>
                      <TableCell><StatusChip status={report.status} /></TableCell>
                      <TableCell>{report.latestResultFetchedAt ? formatDateTime(report.latestResultFetchedAt) : "Still waiting on Yelp"}</TableCell>
                      <TableCell>
                        <Link className="font-medium hover:underline" href={`/reporting/${report.id}`}>
                          Open report
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {reports.pagination.totalPages > 1 ? (
                <div className="flex flex-wrap items-center justify-between gap-3 px-4 pb-4 text-sm text-muted-foreground">
                  <span>
                    Page {reports.pagination.currentPage} of {reports.pagination.totalPages} •{" "}
                    {reports.pagination.filteredTotal} saved runs
                  </span>
                  <div className="flex gap-2">
                    <Link
                      className={`rounded-md border px-3 py-1 ${
                        reports.pagination.hasPreviousPage
                          ? "border-border/70 text-foreground hover:bg-muted/30"
                          : "pointer-events-none border-border/50 opacity-50"
                      }`}
                      href={`/reporting?page=${reports.pagination.currentPage - 1}`}
                    >
                      Previous
                    </Link>
                    <Link
                      className={`rounded-md border px-3 py-1 ${
                        reports.pagination.hasNextPage
                          ? "border-border/70 text-foreground hover:bg-muted/30"
                          : "pointer-events-none border-border/50 opacity-50"
                      }`}
                      href={`/reporting?page=${reports.pagination.currentPage + 1}`}
                    >
                      Next
                    </Link>
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
