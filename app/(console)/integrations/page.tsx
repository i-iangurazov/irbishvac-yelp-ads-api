import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { StatusChip } from "@/components/shared/status-chip";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getIntegrationsOverview } from "@/features/operations/service";
import { requireUser } from "@/lib/auth/service";
import { formatDateTime } from "@/lib/utils/format";

export default async function IntegrationsPage() {
  const user = await requireUser();
  const overview = await getIntegrationsOverview(user.tenantId);

  return (
    <div>
      <PageHeader
        title="Integrations"
        description="Foundation-only connectivity view for credentials and sync pipelines. Useful for diagnostics, but intentionally outside the primary MVP workflow."
        actions={<Badge variant="outline">Beta</Badge>}
      />

      <Card className="border-border/70 bg-muted/20">
        <CardHeader>
          <CardTitle>Why this page is de-emphasized</CardTitle>
          <CardDescription>The MVP uses Settings for control and Audit for follow-up. This page stays as a read-only diagnostic foundation view.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <div>Yelp Ads and Reporting are the only integrations that materially power the current operator workflow.</div>
          <div>Leads, CRM enrichment, and deeper business-access integrations remain foundation work and should not read like finished products.</div>
        </CardContent>
      </Card>

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
          <CardDescription>Retry controls and deeper diagnostics can grow from this same pattern later without turning the page into a faux-finished product today.</CardDescription>
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
