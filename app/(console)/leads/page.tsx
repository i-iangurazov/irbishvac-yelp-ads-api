import Link from "next/link";
import type { UrlObject } from "node:url";

import { LeadsFilterForm } from "@/components/forms/leads-filter-form";
import { LeadSyncForm } from "@/components/forms/lead-sync-form";
import { CapabilityState } from "@/components/shared/capability-state";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { StatusChip } from "@/components/shared/status-chip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { LeadFiltersInput } from "@/features/leads/schemas";
import { getLeadsIndex } from "@/features/leads/service";
import { requireUser } from "@/lib/auth/service";
import { hasPermission } from "@/lib/permissions";
import { formatDateTime } from "@/lib/utils/format";

function formatLeadCount(value: number) {
  return value.toLocaleString();
}

function buildLeadsQuery(values: Record<string, string | number | null | undefined>): UrlObject {
  const query: Record<string, string> = {};

  for (const [key, value] of Object.entries(values)) {
    if (value === null || value === undefined || value === "") {
      continue;
    }

    query[key] = String(value);
  }

  return {
    pathname: "/leads",
    query
  };
}

export default async function LeadsPage({
  searchParams
}: {
  searchParams: Promise<{
    businessId?: string;
    status?: string;
    attention?: string;
    mappingState?: string;
    internalStatus?: string;
    from?: string;
    to?: string;
    page?: string;
    pageSize?: string;
  }>;
}) {
  const user = await requireUser();
  const filters = await searchParams;
  const overview = await getLeadsIndex(user.tenantId, filters as LeadFiltersInput);
  const canSyncLeads = hasPermission(user.role.code, "leads:write");
  const filtersApplied = Object.values(overview.filters).some(Boolean);
  const latestImport = overview.backfill.latestRun;
  const queueSummary =
    overview.summary.totalSyncedLeads === 0
      ? "No synced leads yet."
      : filtersApplied
        ? `${formatLeadCount(overview.pagination.pageRowStart)}-${formatLeadCount(overview.pagination.pageRowEnd)} of ${formatLeadCount(overview.summary.filteredLeads)} matching leads`
        : `${formatLeadCount(overview.pagination.pageRowStart)}-${formatLeadCount(overview.pagination.pageRowEnd)} of ${formatLeadCount(overview.summary.totalSyncedLeads)} synced leads`;
  const historicalImportNote = latestImport
    ? latestImport.hasMore
      ? `Latest manual import scanned ${latestImport.returnedLeadIds} recent Yelp lead IDs across ${latestImport.pagesFetched} page${latestImport.pagesFetched === 1 ? "" : "s"}. Older Yelp history still exists beyond this 300-lead backfill window.`
      : `Latest manual import scanned ${latestImport.returnedLeadIds} recent Yelp lead IDs across ${latestImport.pagesFetched} Yelp page${latestImport.pagesFetched === 1 ? "" : "s"}.`
    : "Manual backfill has not run yet. Webhook intake stays primary, and manual backfill scans up to the latest 300 Yelp leads.";
  const pageSummary =
    overview.summary.filteredLeads === 0
      ? "No matching rows."
      : `${formatLeadCount(overview.pagination.pageRowStart)}-${formatLeadCount(overview.pagination.pageRowEnd)} of ${formatLeadCount(overview.summary.filteredLeads)} matching leads`;
  const allBusinessCount = overview.businessSplit.reduce((total, business) => total + business.count, 0);
  const previousPageHref = buildLeadsQuery({
    ...overview.filters,
    page: overview.pagination.currentPage - 1,
    pageSize: overview.pagination.pageSize
  });
  const nextPageHref = buildLeadsQuery({
    ...overview.filters,
    page: overview.pagination.currentPage + 1,
    pageSize: overview.pagination.pageSize
  });

  return (
    <div>
      <PageHeader
        title="Leads"
        description="One queue for Yelp intake, partner lifecycle, and follow-through."
        actions={
          <Button asChild size="sm" variant="outline">
            <Link href="/autoresponder">Open autoresponder</Link>
          </Button>
        }
      />

      {!overview.capabilityEnabled ? (
        <CapabilityState
          enabled={false}
          message="Yelp Leads is off. Stored records stay visible, but new webhook intake and manual imports are paused until access is enabled."
        />
      ) : null}

      <div className="mt-6 grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(18rem,20rem)]">
        <Card className="self-start shadow-none">
          <CardContent className="grid gap-4 p-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="space-y-1 xl:border-r xl:border-border/70 xl:pr-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Synced</div>
              <div className="text-2xl font-semibold tracking-tight">{formatLeadCount(overview.summary.totalSyncedLeads)}</div>
              <div className="text-xs text-muted-foreground">Stored locally</div>
            </div>
            <div className="space-y-1 xl:border-r xl:border-border/70 xl:px-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Matching</div>
              <div className="text-2xl font-semibold tracking-tight">{formatLeadCount(overview.summary.filteredLeads)}</div>
              <div className="text-xs text-muted-foreground">
                {overview.summary.filteredLeads === 0
                  ? "No rows in the current slice"
                  : `${formatLeadCount(overview.pagination.visibleRows)} on this page`}
              </div>
            </div>
            <div className="space-y-1 xl:border-r xl:border-border/70 xl:px-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Attention</div>
              <div className="text-2xl font-semibold tracking-tight">{formatLeadCount(overview.summary.needsAttention)}</div>
              <div className="text-xs text-muted-foreground">
                {formatLeadCount(overview.summary.unresolvedLeads)} unmapped • {formatLeadCount(overview.summary.crmIssues)} lifecycle issues
              </div>
            </div>
            <div className="space-y-1 xl:pl-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Current page</div>
              <div className="text-2xl font-semibold tracking-tight">
                {overview.pagination.currentPage} / {overview.pagination.totalPages}
              </div>
              <div className="text-xs text-muted-foreground">{formatLeadCount(overview.pagination.pageSize)} rows per page</div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-dashed border-border/80 bg-muted/10 shadow-none">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Manual backfill</CardTitle>
            <CardDescription>Secondary recovery tool for recent Yelp history.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 pt-0">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {latestImport ? <StatusChip status={latestImport.status} /> : <Badge variant="outline">Not run</Badge>}
              {latestImport?.hasMore ? <Badge variant="outline">300-lead window</Badge> : null}
            </div>
            <div className="text-sm text-muted-foreground">{historicalImportNote}</div>
            {latestImport ? (
              <div className="text-xs text-muted-foreground">
                {latestImport.businessName} • {latestImport.importedCount} new • {latestImport.updatedCount} refreshed •{" "}
                {latestImport.failedCount} failed • {formatDateTime(latestImport.startedAt)}
              </div>
            ) : null}
            {canSyncLeads ? (
              <LeadSyncForm
                businesses={overview.businesses.map((business) => ({ id: business.id, name: business.name }))}
                defaultBusinessId={overview.filters.businessId}
                capabilityEnabled={overview.capabilityEnabled}
              />
            ) : (
              <div className="text-sm text-muted-foreground">Write access is required to run a manual backfill.</div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4 shadow-none">
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-2 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <CardTitle className="text-base">Queue controls</CardTitle>
              <CardDescription>Filter the queue and switch business scope without leaving the list.</CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Badge variant="outline">{queueSummary}</Badge>
              {overview.summary.needsAttention > 0 ? (
                <Badge variant="warning">{formatLeadCount(overview.summary.needsAttention)} need attention</Badge>
              ) : null}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {overview.businessSplit.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              <Button
                asChild
                size="sm"
                variant={overview.filters.businessId ? "outline" : "default"}
              >
                <Link
                  href={buildLeadsQuery({
                    ...overview.filters,
                    businessId: null,
                    page: 1,
                    pageSize: overview.pagination.pageSize
                  })}
                >
                  All businesses
                  <span className="ml-2 text-xs opacity-80">{formatLeadCount(allBusinessCount)}</span>
                </Link>
              </Button>
              {overview.businessSplit.map((business) => (
                <Button
                  key={business.id}
                  asChild
                  size="sm"
                  variant={business.isSelected ? "default" : "outline"}
                >
                  <Link
                    href={buildLeadsQuery({
                      ...overview.filters,
                      businessId: business.id,
                      page: 1,
                      pageSize: overview.pagination.pageSize
                    })}
                  >
                    {business.name}
                    <span className="ml-2 text-xs opacity-80">{formatLeadCount(business.count)}</span>
                  </Link>
                </Button>
              ))}
            </div>
          ) : null}

          <LeadsFilterForm
            businesses={overview.businesses.map((business) => ({ id: business.id, name: business.name }))}
            values={overview.filters}
          />
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader className="gap-2 border-b border-border/70 pb-4">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <CardTitle>Lead queue</CardTitle>
              <div className="mt-1 text-sm text-muted-foreground">{queueSummary}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                {formatLeadCount(overview.summary.unresolvedLeads)} unmapped • {formatLeadCount(overview.summary.crmIssues)} lifecycle issues •{" "}
                {formatLeadCount(overview.summary.failedDeliveries)} recent intake failures
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Badge variant="outline">{pageSummary}</Badge>
              <Badge variant="outline">
                {formatLeadCount(overview.pagination.pageSize)} rows per page
              </Badge>
            </div>
          </div>
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
                  <TableHead className="w-[36%]">Lead</TableHead>
                  <TableHead className="w-[18%]">Timeline</TableHead>
                  <TableHead className="w-[24%]">State</TableHead>
                  <TableHead className="w-[22%]">Attention</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {overview.leads.map((lead) => {
                  const primaryLabel = lead.customerLabel === lead.externalLeadId ? lead.externalLeadId : lead.customerLabel;
                  const processingLabel =
                    lead.processingStatus === "COMPLETED"
                      ? lead.internalStatusSource
                        ? lead.internalStatusSource === "CRM"
                          ? "CRM lifecycle"
                          : "Manual lifecycle"
                        : "No partner lifecycle yet"
                      : `Intake ${lead.processingStatus.toLowerCase()}`;

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
                          <div className="truncate text-[11px] text-muted-foreground">
                            {[lead.locationLabel, lead.serviceLabel].filter(Boolean).join(" • ") || "Location or service still unmapped"}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-2 text-sm">
                          <div>{formatDateTime(lead.createdAtYelp)}</div>
                          <div className="text-xs text-muted-foreground">
                            Latest {lead.latestActivityAt ? formatDateTime(lead.latestActivityAt) : "No activity yet"}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-2">
                          <div className="flex flex-wrap gap-2">
                            <StatusChip status={lead.replyState} />
                            <StatusChip status={lead.internalStatus} />
                            <StatusChip status={lead.mappingState} />
                          </div>
                          <div className="text-xs text-muted-foreground">{lead.mappingReference}</div>
                          <div className="text-xs text-muted-foreground">{processingLabel}</div>
                          {lead.processingError ? <div className="text-xs text-destructive">{lead.processingError}</div> : null}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-2">
                          {lead.requiresAttention ? (
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge variant="warning">Needs attention</Badge>
                              {lead.openIssueCount > 0 && lead.primaryIssue ? (
                                <Button asChild size="sm" variant="ghost">
                                  <Link href={`/audit/issues/${lead.primaryIssue.id}`}>
                                    {lead.openIssueCount} open issue{lead.openIssueCount === 1 ? "" : "s"}
                                  </Link>
                                </Button>
                              ) : null}
                            </div>
                          ) : (
                            <div className="text-sm font-medium">Clear</div>
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
          {overview.summary.filteredLeads > 0 ? (
            <div className="flex flex-col gap-3 border-t border-border/70 px-5 py-4 text-sm md:flex-row md:items-center md:justify-between">
              <div className="text-muted-foreground">
                {pageSummary} • page {overview.pagination.currentPage} of {overview.pagination.totalPages}
              </div>
              <div className="flex items-center gap-2">
                <Button asChild disabled={!overview.pagination.hasPreviousPage} size="sm" variant="outline">
                  <Link aria-disabled={!overview.pagination.hasPreviousPage} href={previousPageHref}>
                    Previous
                  </Link>
                </Button>
                <Button asChild disabled={!overview.pagination.hasNextPage} size="sm" variant="outline">
                  <Link aria-disabled={!overview.pagination.hasNextPage} href={nextPageHref}>
                    Next
                  </Link>
                </Button>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
