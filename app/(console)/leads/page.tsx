import Link from "next/link";

import { LeadsFilterForm } from "@/components/forms/leads-filter-form";
import { LeadSyncForm } from "@/components/forms/lead-sync-form";
import { CapabilityState } from "@/components/shared/capability-state";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { StatusChip } from "@/components/shared/status-chip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { LeadFiltersInput } from "@/features/leads/schemas";
import { getLeadsIndex } from "@/features/leads/service";
import { requireUser } from "@/lib/auth/service";
import { hasPermission } from "@/lib/permissions";
import { formatDateTime } from "@/lib/utils/format";

function formatLeadCount(value: number) {
  return value.toLocaleString();
}

export default async function LeadsPage({
  searchParams
}: {
  searchParams: Promise<{
    businessId?: string;
    status?: string;
    mappingState?: string;
    internalStatus?: string;
    from?: string;
    to?: string;
  }>;
}) {
  const user = await requireUser();
  const filters = await searchParams;
  const overview = await getLeadsIndex(user.tenantId, filters as LeadFiltersInput);
  const canSyncLeads = hasPermission(user.role.code, "leads:write");
  const filtersApplied = Object.values(overview.filters).some(Boolean);
  const latestImport = overview.backfill.latestRun;
  const showingSummary =
    overview.summary.totalSyncedLeads === 0
      ? "No synced leads yet."
      : filtersApplied
        ? `Showing all ${formatLeadCount(overview.summary.visibleRows)} leads matching the current filters.`
        : `Showing all ${formatLeadCount(overview.summary.visibleRows)} synced leads.`;

  return (
    <div>
      <PageHeader
        title="Leads"
        description="Track Yelp intake and follow-through from one queue."
        actions={
          <Button asChild size="sm" variant="outline">
            <Link href="/settings#autoresponder">Autoresponder settings</Link>
          </Button>
        }
      />

      {!overview.capabilityEnabled ? (
        <CapabilityState
          enabled={false}
          message="Yelp Leads is disabled for this tenant. Stored records stay visible, but new webhook intake and manual imports will fail until access is enabled."
        />
      ) : null}

      <Card className="mt-6">
        <CardContent className="grid gap-5 p-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(18rem,0.8fr)]">
          <div className="space-y-3">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Sync from Yelp</div>
              <div className="mt-1 text-sm text-muted-foreground">Import lead history for one saved Yelp business.</div>
            </div>
            {canSyncLeads ? (
              <LeadSyncForm
                businesses={overview.businesses.map((business) => ({ id: business.id, name: business.name }))}
                defaultBusinessId={overview.filters.businessId}
                capabilityEnabled={overview.capabilityEnabled}
              />
            ) : (
              <div className="text-sm text-muted-foreground">You can review the queue, but only operators with write access can import leads.</div>
            )}
          </div>

          <div className="rounded-2xl border border-border/80 bg-muted/10 px-4 py-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Latest Yelp import</div>
            {latestImport ? (
              <div className="mt-3 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusChip status={latestImport.status} />
                  <span className="text-sm font-medium">{latestImport.businessName}</span>
                </div>
                <div className="text-sm">
                  {latestImport.returnedLeadIds} lead IDs fetched from Yelp
                  {latestImport.hasMore ? ` (first page of ${latestImport.pageSize})` : ""}
                </div>
                <div className="text-xs text-muted-foreground">
                  {formatDateTime(latestImport.startedAt)}
                  {latestImport.finishedAt ? ` • finished ${formatDateTime(latestImport.finishedAt)}` : ""}
                </div>
                <div className="text-xs text-muted-foreground">
                  {latestImport.importedCount} new • {latestImport.updatedCount} refreshed • {latestImport.failedCount} failed
                </div>
                {latestImport.hasMore ? (
                  <div className="text-xs text-amber-700 dark:text-amber-300">Yelp reported more lead IDs beyond this first page.</div>
                ) : null}
                {latestImport.errorSummary ? <div className="text-xs text-muted-foreground">{latestImport.errorSummary}</div> : null}
              </div>
            ) : (
              <div className="mt-3 text-sm text-muted-foreground">No manual import has run yet.</div>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-border/80 bg-background px-4 py-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Synced leads</div>
          <div className="mt-2 text-2xl font-semibold tracking-tight">{formatLeadCount(overview.summary.totalSyncedLeads)}</div>
          <div className="mt-1 text-xs text-muted-foreground">Stored in the console.</div>
        </div>
        <div className="rounded-2xl border border-border/80 bg-background px-4 py-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Matching filters</div>
          <div className="mt-2 text-2xl font-semibold tracking-tight">{formatLeadCount(overview.summary.filteredLeads)}</div>
          <div className="mt-1 text-xs text-muted-foreground">All matching leads are shown on this page.</div>
        </div>
        <div className="rounded-2xl border border-border/80 bg-background px-4 py-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Needs attention</div>
          <div className="mt-2 text-2xl font-semibold tracking-tight">{formatLeadCount(overview.summary.needsAttention)}</div>
          <div className="mt-1 text-xs text-muted-foreground">Mapping, intake, CRM, or automation issues.</div>
        </div>
        <div className="rounded-2xl border border-border/80 bg-background px-4 py-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Recent intake failures</div>
          <div className="mt-2 text-2xl font-semibold tracking-tight">{formatLeadCount(overview.summary.failedDeliveries)}</div>
          <div className="mt-1 text-xs text-muted-foreground">Recent webhook delivery or processing failures.</div>
        </div>
      </div>

      <div className="mt-4">
        <LeadsFilterForm
          businesses={overview.businesses.map((business) => ({ id: business.id, name: business.name }))}
          values={overview.filters}
        />
      </div>

      <Card className="mt-4">
        <CardHeader className="gap-3 border-b border-border/70 pb-4">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <CardTitle>Lead queue</CardTitle>
              <div className="mt-1 text-sm text-muted-foreground">{showingSummary}</div>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="outline">Yelp reply state</Badge>
              <Badge variant="secondary">Internal status</Badge>
              <Badge variant="outline">Automation + sync</Badge>
            </div>
          </div>
          {latestImport ? (
            <div className="text-xs text-muted-foreground">
              Latest manual import fetched {latestImport.returnedLeadIds} lead IDs from Yelp
              {latestImport.hasMore ? ` and stopped at the first page of ${latestImport.pageSize}.` : "."}
            </div>
          ) : null}
        </CardHeader>
        <CardContent className="p-0">
          {overview.leads.length === 0 ? (
            <div className="p-6">
              <EmptyState
                title="No leads match the current filters"
                description="Import leads for a saved Yelp business, or wait for webhook intake."
              />
            </div>
          ) : (
            <Table className="table-fixed">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[34%]">Lead</TableHead>
                  <TableHead className="w-[18%]">Activity</TableHead>
                  <TableHead className="w-[16%]">Yelp</TableHead>
                  <TableHead className="w-[18%]">Internal</TableHead>
                  <TableHead className="w-[14%]">Attention</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {overview.leads.map((lead) => {
                  const primaryLabel = lead.customerLabel === lead.externalLeadId ? lead.externalLeadId : lead.customerLabel;

                  return (
                    <TableRow key={lead.id}>
                      <TableCell>
                        <div className="space-y-1.5">
                          <Link className="line-clamp-1 font-semibold tracking-tight hover:underline" href={`/leads/${lead.id}`}>
                            {primaryLabel}
                          </Link>
                          {lead.customerLabel !== lead.externalLeadId ? (
                            <div className="truncate font-mono text-[11px] text-muted-foreground">{lead.externalLeadId}</div>
                          ) : null}
                          <div className="text-sm text-muted-foreground">{lead.mappedBusinessName ?? "Unmapped business"}</div>
                          <div className="truncate text-[11px] text-muted-foreground">{lead.externalBusinessId ?? "Business ID unavailable"}</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-2 text-sm">
                          <div>
                            <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">Created</div>
                            <div className="mt-1">{formatDateTime(lead.createdAtYelp)}</div>
                          </div>
                          <div>
                            <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">Latest</div>
                            <div className="mt-1">{lead.latestActivityAt ? formatDateTime(lead.latestActivityAt) : "No activity yet"}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-2">
                          <div className="flex flex-wrap gap-2">
                            <StatusChip status={lead.replyState} />
                            <StatusChip status={lead.processingStatus} />
                          </div>
                          {lead.processingError ? <div className="text-xs text-destructive">{lead.processingError}</div> : null}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-2">
                          <div className="flex flex-wrap gap-2">
                            <StatusChip status={lead.mappingState} />
                            <StatusChip status={lead.internalStatus} />
                          </div>
                          <div className="text-xs text-muted-foreground">{lead.mappingReference}</div>
                          <div className="text-xs text-muted-foreground">
                            {lead.internalStatusSource ? (lead.internalStatusSource === "CRM" ? "CRM-synced" : "Manual/internal") : "No internal status yet"}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-2">
                          {lead.requiresAttention ? (
                            <Badge variant="warning">Needs attention</Badge>
                          ) : (
                            <Badge variant="outline">No open issue</Badge>
                          )}
                          <div className="space-y-1 text-xs text-muted-foreground">
                            {lead.requiresAttention ? (
                              lead.attentionReasons.slice(0, 2).map((reason) => (
                                <div key={reason}>{reason}</div>
                              ))
                            ) : lead.automationStatus === "SENT" ? (
                              <div>{lead.automationMessage}</div>
                            ) : (
                              <div>{lead.crmHealthMessage}</div>
                            )}
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {overview.failedDeliveries.length > 0 ? (
        <Card className="mt-4">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Recent intake failures</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {overview.failedDeliveries.map((event) => (
              <div
                className="rounded-2xl border border-border/80 bg-muted/10 px-4 py-3"
                key={event.id}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <StatusChip status={event.status} />
                  <span className="text-sm font-medium">{event.lead?.externalLeadId ?? "Lead not linked yet"}</span>
                  <span className="text-xs text-muted-foreground">{formatDateTime(event.receivedAt)}</span>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {event.lead?.business?.name ?? "Unknown business"}
                  {event.syncRun?.errors[0]?.message ? ` • ${event.syncRun.errors[0].message}` : ""}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
