import { EmptyState } from "@/components/shared/empty-state";
import { MetricCard } from "@/components/shared/metric-card";
import { PageHeader } from "@/components/shared/page-header";
import { StatusChip } from "@/components/shared/status-chip";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getIntegrationsOverview } from "@/features/operations/service";
import { requireUser } from "@/lib/auth/service";
import { formatDateTime } from "@/lib/utils/format";

export default async function IntegrationsPage() {
  const user = await requireUser();
  const overview = await getIntegrationsOverview(user.tenantId);
  const enabledCount = overview.integrations.filter((integration) => integration.enabled).length;
  const totalErrors = overview.integrations.reduce((sum, integration) => sum + (integration.errorCount ?? 0), 0);

  return (
    <div>
      <PageHeader
        title="Integrations"
        description="Monitor Yelp and CRM connectivity, recent sync activity, and the explicit boundaries between Yelp-native data and CRM-derived operational state."
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="Enabled integrations" value={enabledCount} description="Capabilities enabled for the current tenant and environment." />
        <MetricCard title="Sync errors" value={totalErrors} description="Recorded sync errors across lead, reporting, and CRM foundation jobs." />
        <MetricCard title="Recent sync runs" value={overview.recentSyncRuns.length} description="Most recent sync executions across all operational pipelines." />
        <MetricCard title="Coverage" value={`${overview.integrations.length} modules`} description="Tracked APIs and downstream enrichment systems." />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        {overview.integrations.map((integration) => (
          <Card key={integration.id}>
            <CardHeader>
              <CardTitle>{integration.label}</CardTitle>
              <CardDescription>{integration.detail}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">Status</span>
                <StatusChip status={integration.enabled ? "SUCCESS" : "FAILED"} />
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">Last successful sync</span>
                <span>{formatDateTime(integration.lastSuccessfulSyncAt)}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">Error count</span>
                <span>{integration.errorCount ?? 0}</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Recent sync runs</CardTitle>
          <CardDescription>Retry controls and deeper diagnostics will attach to this same operational log pattern in later phases.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {overview.recentSyncRuns.length === 0 ? (
            <div className="p-6">
              <EmptyState
                title="No sync runs recorded yet"
                description="Once lead ingestion, reporting polling, and CRM enrichment are wired, this log will expose recent executions and retry-safe diagnostics."
              />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Started</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Scope</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Issues</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {overview.recentSyncRuns.map((syncRun) => (
                  <TableRow key={syncRun.id}>
                    <TableCell>{formatDateTime(syncRun.startedAt)}</TableCell>
                    <TableCell>{syncRun.type}</TableCell>
                    <TableCell>{syncRun.location?.name ?? syncRun.business?.name ?? syncRun.lead?.customerName ?? "Tenant-wide"}</TableCell>
                    <TableCell>
                      <StatusChip status={syncRun.status} />
                    </TableCell>
                    <TableCell>{syncRun._count.errors}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
