import { CapabilityState } from "@/components/shared/capability-state";
import { EmptyState } from "@/components/shared/empty-state";
import { MetricCard } from "@/components/shared/metric-card";
import { PageHeader } from "@/components/shared/page-header";
import { StatusChip } from "@/components/shared/status-chip";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getLeadsOverview } from "@/features/operations/service";
import { requireUser } from "@/lib/auth/service";
import { formatDateTime } from "@/lib/utils/format";

export default async function LeadsPage() {
  const user = await requireUser();
  const overview = await getLeadsOverview(user.tenantId);

  return (
    <div>
      <PageHeader
        title="Leads"
        description="Yelp lead activity and CRM enrichment will live side by side here, with source boundaries kept explicit at the table, detail, and sync layers."
      />

      <div className="grid gap-6 xl:grid-cols-2">
        <CapabilityState enabled={overview.capabilityStates.yelp.enabled} message={overview.capabilityStates.yelp.message} />
        <CapabilityState enabled={overview.capabilityStates.crm.enabled} message={overview.capabilityStates.crm.message} />
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="Normalized leads" value={overview.counts.totalLeads} description="Lead records normalized from Yelp lead payloads." />
        <MetricCard title="CRM mapped" value={overview.counts.mappedLeads} description="Leads matched to downstream CRM entities." />
        <MetricCard title="Lead events" value={overview.counts.leadEvents} description="Interaction rows preserved for lead detail timelines." />
        <MetricCard title="Webhook deliveries" value={overview.counts.webhookEvents} description="Raw Yelp webhook deliveries stored for idempotent replay and diagnostics." />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <Card>
          <CardHeader>
            <CardTitle>Source-of-truth boundary</CardTitle>
            <CardDescription>Phase 1 makes the ownership line explicit before the full lead list and detail surfaces land.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <div>Yelp owns lead creation, interaction events, and reply or read markers.</div>
            <div>CRM or ServiceTitan owns Scheduled, Job in Progress, Completed, and related operational lifecycle states.</div>
            <div>The later lead list and detail pages will render both, but never collapse those sources into a single implied truth.</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent lead sync runs</CardTitle>
            <CardDescription>Webhook, backfill, and CRM enrichment runs for the leads domain.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {overview.recentSyncRuns.length === 0 ? (
              <div className="p-6">
                <EmptyState
                  title="No lead sync runs yet"
                  description="Lead ingestion routes are not wired yet in this phase, so no webhook or enrichment executions have been recorded."
                />
              </div>
            ) : (
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
                  {overview.recentSyncRuns.map((syncRun) => (
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
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Recent webhook deliveries</CardTitle>
          <CardDescription>Raw deliveries will back the lead detail diagnostics and idempotency controls.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {overview.recentWebhookEvents.length === 0 ? (
            <div className="p-6">
              <EmptyState
                title="No Yelp webhook deliveries stored yet"
                description="Once lead webhooks are wired, this table will show delivery timestamps, processing status, and any replay-safe failure diagnostics."
              />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Received</TableHead>
                  <TableHead>Topic</TableHead>
                  <TableHead>Lead</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {overview.recentWebhookEvents.map((event) => (
                  <TableRow key={event.id}>
                    <TableCell>{formatDateTime(event.receivedAt)}</TableCell>
                    <TableCell>{event.topic}</TableCell>
                    <TableCell>{event.lead?.customerName ?? event.lead?.externalLeadId ?? "Pending normalization"}</TableCell>
                    <TableCell>
                      <StatusChip status={event.status} />
                    </TableCell>
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
