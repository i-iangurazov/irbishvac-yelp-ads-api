import Link from "next/link";

import { ConnectorBusinessLocationForm } from "@/components/forms/connector-business-location-form";
import { ConnectorLocationReferenceForm } from "@/components/forms/connector-location-reference-form";
import { ConnectorServiceMappingForm } from "@/components/forms/connector-service-mapping-form";
import { ServiceTitanConnectorForm } from "@/components/forms/servicetitan-connector-form";
import { ServiceTitanLifecycleSyncForm } from "@/components/forms/servicetitan-lifecycle-sync-form";
import { ServiceTitanReferenceSyncForm } from "@/components/forms/servicetitan-reference-sync-form";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { StatusChip } from "@/components/shared/status-chip";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getServiceTitanConnectorOverview } from "@/features/crm-connector/service";
import { requireUser } from "@/lib/auth/service";
import { getDefaultServiceTitanUrls, type ServiceTitanEnvironment } from "@/lib/servicetitan/runtime";
import { formatDateTime } from "@/lib/utils/format";

function buildConnectorDefaults(overview: Awaited<ReturnType<typeof getServiceTitanConnectorOverview>>) {
  const environment: ServiceTitanEnvironment =
    overview.connector.environment === "INTEGRATION" ? "INTEGRATION" : "PRODUCTION";
  const defaults = getDefaultServiceTitanUrls(environment);

  return {
    label: overview.connector.config?.label ?? "ServiceTitan Connector",
    environment,
    tenantId: overview.connector.config?.tenantId ?? "",
    appKey: overview.connector.config?.appKey ?? "",
    clientId: overview.connector.config?.clientId ?? "",
    clientSecret: "",
    apiBaseUrl: overview.connector.config?.apiBaseUrl ?? defaults.apiBaseUrl,
    authBaseUrl: overview.connector.config?.authBaseUrl ?? defaults.authBaseUrl,
    isEnabled: overview.connector.enabled
  } as const;
}

function formatCatalogStatus(totalCount: number, hasMore: boolean) {
  if (totalCount === 0) {
    return "No references stored yet";
  }

  if (hasMore) {
    return `${totalCount}+ rows available upstream`;
  }

  return `${totalCount} rows available`;
}

export default async function IntegrationsPage() {
  const user = await requireUser();
  const overview = await getServiceTitanConnectorOverview(user.tenantId);
  const formDefaults = buildConnectorDefaults(overview);

  return (
    <div>
      <PageHeader
        title="Integrations"
        description="ServiceTitan connector setup, mapping coverage, and downstream sync health."
        actions={
          <div className="flex items-center gap-2">
            <Badge variant="outline">{overview.connector.environment === "INTEGRATION" ? "Integration env" : "Production env"}</Badge>
            <StatusChip status={overview.connector.enabled ? "ACTIVE" : "INACTIVE"} />
          </div>
        }
      />

      <Card className="shadow-none">
        <CardContent className="grid gap-4 p-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="space-y-1 xl:border-r xl:border-border/70 xl:pr-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Connector status</div>
            <div className="text-2xl font-semibold tracking-tight">{overview.connector.health?.setupLabel ?? "Not configured"}</div>
            <div className="text-xs text-muted-foreground">
              {overview.connector.health?.detail ?? "Save ServiceTitan credentials to enable testing and reference sync."}
            </div>
          </div>
          <div className="space-y-1 xl:border-r xl:border-border/70 xl:px-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Mapping coverage</div>
            <div className="text-2xl font-semibold tracking-tight">{overview.counts.mappedLeads}</div>
            <div className="text-xs text-muted-foreground">{overview.counts.unresolvedLeadMappings} leads still need mapping or review</div>
          </div>
          <div className="space-y-1 xl:border-r xl:border-border/70 xl:px-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Lifecycle sync</div>
            <div className="text-2xl font-semibold tracking-tight">{formatDateTime(overview.lifecycle.latestSuccessfulRun?.finishedAt ?? null)}</div>
            <div className="text-xs text-muted-foreground">
              Due now {overview.lifecycle.coverage.dueLeadCount} • Stale {overview.lifecycle.coverage.staleLeadCount}
            </div>
          </div>
          <div className="space-y-1 xl:pl-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Open connector issues</div>
            <div className="text-2xl font-semibold tracking-tight">{overview.counts.openConnectorIssues}</div>
            <Link className="text-xs font-medium text-foreground hover:underline" href="/audit">
              Open Audit queue
            </Link>
          </div>
        </CardContent>
      </Card>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-6">
          <ServiceTitanConnectorForm defaultValues={formDefaults} />

          <Card>
            <CardHeader>
              <CardTitle>Sync controls</CardTitle>
              <CardDescription>
                Run safe reference refreshes and lifecycle reconciliation without rewriting Yelp history. Lifecycle sync appends partner lifecycle events only when ServiceTitan provides newer downstream evidence.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3 rounded-xl border border-border/70 bg-muted/20 p-4">
                <div>
                  <div className="font-medium text-foreground">Lifecycle reconcile</div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    Poll mapped ServiceTitan leads and jobs, append newer partner lifecycle events, and leave Yelp-native activity untouched.
                  </div>
                </div>
                <ServiceTitanLifecycleSyncForm disabled={!overview.connector.enabled} />
                <div className="grid gap-3 text-sm text-muted-foreground md:grid-cols-3">
                  <div className="rounded-xl border border-border/70 bg-background p-4">
                    <div className="font-medium text-foreground">Pollable mapped leads</div>
                    <div className="mt-1">{overview.lifecycle.coverage.pollableLeadCount}</div>
                  </div>
                  <div className="rounded-xl border border-border/70 bg-background p-4">
                    <div className="font-medium text-foreground">Manual-only mappings</div>
                    <div className="mt-1">{overview.lifecycle.coverage.manualOnlyMappedLeadCount}</div>
                  </div>
                  <div className="rounded-xl border border-border/70 bg-background p-4">
                    <div className="font-medium text-foreground">Stale refreshes</div>
                    <div className="mt-1">{overview.lifecycle.coverage.staleLeadCount}</div>
                  </div>
                </div>
              </div>

              <div className="space-y-3 rounded-xl border border-border/70 bg-muted/20 p-4">
                <div>
                  <div className="font-medium text-foreground">Reference catalogs</div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    Refresh the ServiceTitan business-unit and category catalogs used by the mapping tables below. These are safe reference-data syncs, not destructive lead rewrites.
                  </div>
                </div>
                <ServiceTitanReferenceSyncForm disabled={!overview.connector.enabled} />
              </div>
              <div className="grid gap-3 text-sm text-muted-foreground md:grid-cols-2">
                <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
                  <div className="font-medium text-foreground">Business-unit catalog</div>
                  <div className="mt-1">{formatCatalogStatus(overview.catalog.businessUnits.totalCount, overview.catalog.businessUnits.hasMore)}</div>
                  <div className="mt-1">Last refreshed {formatDateTime(overview.catalog.businessUnits.syncedAt ? new Date(overview.catalog.businessUnits.syncedAt) : null)}</div>
                </div>
                <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
                  <div className="font-medium text-foreground">Category catalog</div>
                  <div className="mt-1">{formatCatalogStatus(overview.catalog.categories.totalCount, overview.catalog.categories.hasMore)}</div>
                  <div className="mt-1">Last refreshed {formatDateTime(overview.catalog.categories.syncedAt ? new Date(overview.catalog.categories.syncedAt) : null)}</div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Yelp businesses to internal locations</CardTitle>
              <CardDescription>
                Assign each saved Yelp business to the internal location that should own downstream lifecycle and reporting rollups.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {overview.businesses.length === 0 ? (
                <div className="p-6">
                  <EmptyState title="No saved Yelp businesses yet" description="Save businesses first so the connector can route downstream data to internal locations." />
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Business</TableHead>
                      <TableHead>Lead coverage</TableHead>
                      <TableHead>Internal location</TableHead>
                      <TableHead>Connector ref</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {overview.businesses.map((business) => (
                      <TableRow key={business.id}>
                        <TableCell>
                          <div className="font-medium">{business.name}</div>
                          <div className="text-xs text-muted-foreground">{business.yelpBusinessId}</div>
                        </TableCell>
                        <TableCell>{business.leadCount}</TableCell>
                        <TableCell>
                          <ConnectorBusinessLocationForm
                            businessId={business.id}
                            defaultLocationId={business.locationId}
                            locations={overview.locations.map((location) => ({ id: location.id, name: location.name }))}
                          />
                        </TableCell>
                        <TableCell>
                          {business.locationConnectorReferenceName ? (
                            <div>
                              <div className="font-medium">{business.locationConnectorReferenceName}</div>
                              <div className="text-xs text-muted-foreground">{business.locationConnectorReferenceId}</div>
                            </div>
                          ) : (
                            <StatusChip status={business.needsAttention ? "UNMAPPED" : "UNKNOWN"} />
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Internal locations to ServiceTitan references</CardTitle>
              <CardDescription>
                Map each internal location to the ServiceTitan business unit or branch reference used by your downstream workflow.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {overview.locations.length === 0 ? (
                <div className="p-6">
                  <EmptyState title="No internal locations yet" description="Add internal locations before linking them to ServiceTitan references." />
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Location</TableHead>
                      <TableHead>Businesses</TableHead>
                      <TableHead>Connector ref</TableHead>
                      <TableHead>Leads</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {overview.locations.map((location) => (
                      <TableRow key={location.id}>
                        <TableCell>
                          <div className="font-medium">{location.name}</div>
                          <div className="text-xs text-muted-foreground">{location.code ?? "No code"}</div>
                        </TableCell>
                        <TableCell>{location.businessCount}</TableCell>
                        <TableCell>
                          <div className="space-y-2">
                            <ConnectorLocationReferenceForm
                              locationId={location.id}
                              defaultReferenceId={location.externalCrmLocationId}
                              options={overview.catalog.businessUnits.rows.map((row) => ({ id: row.id, name: row.name }))}
                            />
                            {location.connectorReferenceName ? (
                              <div className="text-xs text-muted-foreground">
                                Linked to {location.connectorReferenceName} ({location.externalCrmLocationId})
                              </div>
                            ) : (
                              <div className="text-xs text-amber-700">No ServiceTitan reference linked yet.</div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>{location.leadCount}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Service categories to ServiceTitan categories</CardTitle>
              <CardDescription>
                Store the ServiceTitan category IDs or names used for downstream service mapping. Unknown categories stay visible until they are mapped.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {overview.serviceCategories.length === 0 ? (
                <div className="p-6">
                  <EmptyState title="No service categories yet" description="Create normalized service categories before connector-backed service mapping can be managed here." />
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Service</TableHead>
                      <TableHead>Current mapping</TableHead>
                      <TableHead>Connector codes</TableHead>
                      <TableHead>Lead coverage</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {overview.serviceCategories.map((serviceCategory) => (
                      <TableRow key={serviceCategory.id}>
                        <TableCell>
                          <div className="font-medium">{serviceCategory.name}</div>
                          <div className="text-xs text-muted-foreground">{serviceCategory.slug}</div>
                        </TableCell>
                        <TableCell>
                          {serviceCategory.connectorMatches.length > 0 ? (
                            <div className="space-y-1 text-sm">
                              {serviceCategory.connectorMatches.map((match) => (
                                <div key={`${serviceCategory.id}:${match.id}`}>
                                  {match.name} <span className="text-muted-foreground">({match.id})</span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <StatusChip status="UNMAPPED" />
                          )}
                        </TableCell>
                        <TableCell>
                          <ConnectorServiceMappingForm
                            serviceCategoryId={serviceCategory.id}
                            defaultCodes={serviceCategory.crmCodes}
                          />
                        </TableCell>
                        <TableCell>
                          <div>{serviceCategory.leadCount} leads</div>
                          <div className="text-xs text-muted-foreground">{serviceCategory.reportingSnapshotCount} report rows</div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Open connector issues</CardTitle>
              <CardDescription>Failed connector syncs, unmapped leads, mapping conflicts, and stale lifecycle coverage stay in the main operator queue.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {overview.openIssues.length === 0 ? (
                <EmptyState title="No open connector issues" description="Connector-specific issues will appear here and in Audit when sync, mapping, or lifecycle coverage breaks." />
              ) : (
                overview.openIssues.map((issue) => (
                  <div key={issue.id} className="rounded-xl border border-border/70 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-medium">{issue.typeLabel}</div>
                      <StatusChip status={issue.severity} />
                    </div>
                    <div className="mt-1 text-sm text-muted-foreground">{issue.summary}</div>
                    <div className="mt-2 text-xs text-muted-foreground">{issue.targetLabel}</div>
                    <div className="mt-3">
                      <Link className="text-sm font-medium hover:underline" href={`/audit/issues/${issue.id}`}>
                        Review issue
                      </Link>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent connector syncs</CardTitle>
              <CardDescription>Reference refreshes and downstream sync runs share the same audit and retry pattern as the rest of the product.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {overview.recentSyncRuns.length === 0 ? (
                <div className="p-6">
                  <EmptyState title="No connector syncs recorded yet" description="Run a ServiceTitan reference sync or downstream lifecycle sync to start populating this history." />
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
                        <TableCell>{syncRun.typeLabel}</TableCell>
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
      </div>
    </div>
  );
}
