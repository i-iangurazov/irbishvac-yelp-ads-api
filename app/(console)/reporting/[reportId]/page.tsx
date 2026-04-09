import { ReportBreakdownFilterForm } from "@/components/forms/report-breakdown-filter-form";
import { ReportStatusPoller } from "@/components/forms/report-status-poller";
import { EmptyState } from "@/components/shared/empty-state";
import { JsonViewer } from "@/components/shared/json-viewer";
import { MetricCard } from "@/components/shared/metric-card";
import { PageHeader } from "@/components/shared/page-header";
import { ReportChart } from "@/components/shared/report-chart";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getReportBreakdownView } from "@/features/reporting/service";
import { requireUser } from "@/lib/auth/service";
import { formatCurrency, formatDateTime } from "@/lib/utils/format";

function buildQueryString(values: Record<string, string | undefined>) {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(values)) {
    if (value) {
      searchParams.set(key, value);
    }
  }

  const query = searchParams.toString();
  return query ? `?${query}` : "";
}

export default async function ReportDetailPage({
  params,
  searchParams
}: {
  params: Promise<{ reportId: string }>;
  searchParams: Promise<{
    view?: "location" | "service";
    from?: string;
    to?: string;
    locationId?: string;
    serviceCategoryId?: string;
  }>;
}) {
  const user = await requireUser();
  const { reportId } = await params;
  const filters = await searchParams;
  const reportView = await getReportBreakdownView(user.tenantId, reportId, filters);
  const { report, payload, breakdown } = reportView;
  const totals = payload.totals ?? {};
  const rows = payload.rows ?? [];
  const latestResult = [...report.results].sort((left, right) => right.fetchedAt.getTime() - left.fetchedAt.getTime())[0];
  const currentQueryString = buildQueryString({
    view: reportView.filters.view,
    from: reportView.filters.from,
    to: reportView.filters.to,
    locationId: reportView.filters.locationId,
    serviceCategoryId: reportView.filters.serviceCategoryId
  });
  const locationViewHref = `/reporting/${report.id}${buildQueryString({
    view: "location",
    from: reportView.filters.from,
    to: reportView.filters.to,
    locationId: reportView.filters.locationId,
    serviceCategoryId: reportView.filters.serviceCategoryId
  })}`;
  const serviceViewHref = `/reporting/${report.id}${buildQueryString({
    view: "service",
    from: reportView.filters.from,
    to: reportView.filters.to,
    locationId: reportView.filters.locationId,
    serviceCategoryId: reportView.filters.serviceCategoryId
  })}`;

  return (
    <div>
      <PageHeader
        title={`${report.granularity} report`}
        description="Yelp batch snapshot for intake and on-Yelp engagement, plus separate partner lifecycle outcomes. Freshness reflects saved payloads, not live performance."
        actions={
          <Button asChild variant="outline">
            <a href={`/api/reports/${report.id}/export${currentQueryString}`}>Export CSV</a>
          </Button>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="Impressions" value={totals.impressions ?? 0} />
        <MetricCard title="Clicks" value={totals.clicks ?? 0} />
        <MetricCard title="Ad spend" value={formatCurrency(totals.adSpendCents ?? 0)} />
        <MetricCard title="Calls" value={totals.calls ?? 0} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Batch details</CardTitle>
              <CardDescription>Check freshness, scope, and source boundaries before treating this report as final.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div className="flex flex-wrap gap-2">
                <Badge>Yelp batch data</Badge>
                <Badge variant="outline">Not real-time</Badge>
                <Badge variant="secondary">{report.status}</Badge>
                <Badge variant="secondary">Internal outcomes stay separate</Badge>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <div className="text-muted-foreground">Scope</div>
                  <div>{report.business?.name ?? "Multiple businesses"}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Requested</div>
                  <div>{formatDateTime(report.createdAt)}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Date window</div>
                  <div>
                    {formatDateTime(report.startDate, "MMM d, yyyy")} to {formatDateTime(report.endDate, "MMM d, yyyy")}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground">Last fetched snapshot</div>
                  <div>{latestResult ? formatDateTime(latestResult.fetchedAt) : "Still waiting on Yelp"}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Upstream report ID</div>
                  <div>{report.upstreamRequestId ?? "Not assigned yet"}</div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{reportView.filters.view === "location" ? "Location breakdown" : "Service breakdown"}</CardTitle>
              <CardDescription>
                Yelp spend comes from the saved batch. Lead counts reflect Yelp intake in the selected window; booked and downstream outcomes are partner-derived.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex flex-wrap gap-2">
                <Button asChild size="sm" variant={reportView.filters.view === "location" ? "default" : "outline"}>
                  <a href={locationViewHref}>By location</a>
                </Button>
                <Button asChild size="sm" variant={reportView.filters.view === "service" ? "default" : "outline"}>
                  <a href={serviceViewHref}>By service</a>
                </Button>
              </div>

              <ReportBreakdownFilterForm
                locations={reportView.options.locations}
                reportId={report.id}
                serviceCategories={reportView.options.serviceCategories}
                values={reportView.filters}
              />

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-8">
                <MetricCard title="Leads" value={breakdown.totals.totalLeads} description="Yelp leads created in the selected window." />
                <MetricCard title="Mapped" value={breakdown.totals.mappedLeads} description="Leads with a resolved internal mapping." />
                <MetricCard title="Active / contacted" value={`${breakdown.totals.active} / ${breakdown.totals.contacted}`} description="Partner lifecycle follow-through after intake." />
                <MetricCard title="Booked / scheduled" value={`${breakdown.totals.booked} / ${breakdown.totals.scheduled}`} description="Partner lifecycle milestones from internal systems." />
                <MetricCard title="In progress" value={breakdown.totals.jobInProgress} description="Current internal job-in-progress outcomes." />
                <MetricCard title="Completed / won" value={`${breakdown.totals.completed} / ${breakdown.totals.won}`} description="Completed includes closed-won outcomes when present." />
                <MetricCard title="Yelp spend" value={formatCurrency(breakdown.totals.yelpSpendCents)} description="Only where the saved Yelp batch can be mapped safely." />
                <MetricCard title="CPL / win rate" value={`${breakdown.totals.costPerLeadCents !== null ? formatCurrency(breakdown.totals.costPerLeadCents) : "—"} / ${breakdown.totals.winRate}%`} description="Derived from Yelp spend plus partner lifecycle outcomes." />
              </div>

              <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border/80 bg-muted/15 px-4 py-3 text-xs text-muted-foreground">
                <Badge>Unknown buckets stay visible</Badge>
                <Badge variant="outline">Yelp spend is dimension-safe only</Badge>
                <span>
                  {reportView.filters.view === "service"
                    ? "Service spend stays in Unknown service unless the saved Yelp payload carries a service dimension we can map safely."
                    : "Location spend follows the saved business-to-location mapping. Unmapped businesses stay in Unknown location."}
                </span>
              </div>

              {breakdown.rows.length === 0 ? (
                <EmptyState
                  title="No grouped rows match these filters"
                  description="Try a wider date range or clear a location/service filter. Unknown buckets remain available when unmapped data exists."
                />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{reportView.filters.view === "location" ? "Location" : "Service"}</TableHead>
                      <TableHead>Yelp</TableHead>
                      <TableHead>Lead intake</TableHead>
                      <TableHead>Partner lifecycle</TableHead>
                      <TableHead>Conversion</TableHead>
                      <TableHead>Cost</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {breakdown.rows.map((row) => (
                      <TableRow key={row.bucketId}>
                        <TableCell>
                          <div className="font-medium">{row.bucketLabel}</div>
                          <div className="text-xs text-muted-foreground">
                            {row.leadSharePct}% of leads • {row.spendSharePct}% of spend
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">{formatCurrency(row.yelpSpendCents)}</div>
                          <div className="text-xs text-muted-foreground">Delayed Yelp batch spend</div>
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">{row.totalLeads} leads</div>
                          <div className="text-xs text-muted-foreground">
                            {row.mappedLeads} mapped • {row.mappingRate}% mapping rate
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1 text-xs text-muted-foreground">
                            <div><span className="font-medium text-foreground">{row.active}</span> active • <span className="font-medium text-foreground">{row.contacted}</span> contacted</div>
                            <div><span className="font-medium text-foreground">{row.booked}</span> booked • <span className="font-medium text-foreground">{row.scheduled}</span> scheduled</div>
                            <div><span className="font-medium text-foreground">{row.jobInProgress}</span> in progress • <span className="font-medium text-foreground">{row.completed}</span> completed</div>
                            <div><span className="font-medium text-foreground">{row.won}</span> won • <span className="font-medium text-foreground">{row.lost}</span> lost</div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1 text-xs text-muted-foreground">
                            <div><span className="font-medium text-foreground">{row.bookedRate}%</span> booked rate</div>
                            <div><span className="font-medium text-foreground">{row.scheduledRate}%</span> scheduled rate</div>
                            <div><span className="font-medium text-foreground">{row.completionRate}%</span> completion rate</div>
                            <div><span className="font-medium text-foreground">{row.winRate}%</span> win rate</div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1 text-xs text-muted-foreground">
                            <div><span className="font-medium text-foreground">{row.costPerLeadCents !== null ? formatCurrency(row.costPerLeadCents) : "—"}</span> CPL</div>
                            <div><span className="font-medium text-foreground">{row.costPerBookedJobCents !== null ? formatCurrency(row.costPerBookedJobCents) : "—"}</span> cost per booked</div>
                            <div><span className="font-medium text-foreground">{row.costPerCompletedJobCents !== null ? formatCurrency(row.costPerCompletedJobCents) : "—"}</span> cost per completed</div>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <ReportChart rows={rows} />

          <Card>
            <CardHeader>
              <CardTitle>Table view</CardTitle>
              <CardDescription>Raw combined Yelp rows remain available when the saved snapshot needs to move outside the console.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {rows.length === 0 ? (
                <div className="p-6">
                  <EmptyState
                    title="No row data stored yet"
                    description="Wait for Yelp to finish the batch request or inspect the raw payload on the right if this report failed."
                  />
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      {rows[0] ? Object.keys(rows[0]).map((key) => <TableHead key={key}>{key}</TableHead>) : null}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row, index) => (
                      <TableRow key={index}>
                        {Object.entries(row).map(([key, value]) => (
                          <TableCell key={key}>{String(value ?? "")}</TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <ReportStatusPoller reportId={report.id} />

          {user.role.code === "ADMIN" ? (
            <Card>
              <CardHeader>
                <CardTitle>Raw JSON payload</CardTitle>
                <CardDescription>Admin-only diagnostic view of the saved combined payload.</CardDescription>
              </CardHeader>
              <CardContent>
                <JsonViewer value={payload} />
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
