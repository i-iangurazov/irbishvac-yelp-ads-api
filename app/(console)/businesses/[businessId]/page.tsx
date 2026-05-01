import Link from "next/link";
import type { Route } from "next";

import { BusinessDeleteForm } from "@/components/forms/business-delete-form";
import { BusinessYelpLeadsCheckButton } from "@/components/forms/business-yelp-leads-check-button";
import { BusinessYelpSubscriptionActions } from "@/components/forms/business-yelp-subscription-actions";
import { YelpSyncButton } from "@/components/forms/yelp-sync-button";
import { AuditTimeline } from "@/components/shared/audit-timeline";
import { PageHeader } from "@/components/shared/page-header";
import { StatusChip } from "@/components/shared/status-chip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getBusinessDetail } from "@/features/businesses/service";
import { requireUser } from "@/lib/auth/service";
import { hasPermission } from "@/lib/permissions";
import { formatCurrency, formatDateTime, titleCase } from "@/lib/utils/format";
import { formatYelpCategory } from "@/lib/yelp/categories";

const eligibilityVariantMap = {
  UNKNOWN: "outline",
  ELIGIBLE: "success",
  BLOCKED: "destructive"
} as const;

const eligibilityLabelMap = {
  UNKNOWN: "Unknown",
  ELIGIBLE: "Eligible",
  BLOCKED: "Blocked by Yelp policy"
} as const;

export default async function BusinessDetailPage({ params }: { params: Promise<{ businessId: string }> }) {
  const user = await requireUser();
  const { businessId } = await params;
  const business = await getBusinessDetail(user.tenantId, businessId);
  const canManageBusinesses = hasPermission(user.role.code, "businesses:write");
  const hasBlockingPrograms = business.programs.some((program) =>
    ["ACTIVE", "SCHEDULED", "QUEUED", "PROCESSING"].includes(program.status)
  );
  const deleteDisabledReason =
    user.role.code !== "ADMIN"
      ? "Only Admin users can delete businesses."
      : hasBlockingPrograms
        ? "Terminate or resolve active and pending programs before deleting this business."
        : undefined;

  return (
    <div>
      <PageHeader
        title={business.name}
        description="One place to check Yelp connection, automation, programs, mappings, reports, and issues for this business."
        actions={
          <div className="flex flex-wrap items-start gap-3">
            <Button asChild>
              <Link href={`/programs/new?businessId=${business.id}`}>New program</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/reporting">Run report</Link>
            </Button>
            <YelpSyncButton label="Refresh Yelp" syncPath={`/api/businesses/${business.id}/programs/sync`} />
            <BusinessDeleteForm
              businessId={business.id}
              businessName={business.name}
              deleteImpact={business.deleteImpact}
              disabledReason={deleteDisabledReason}
            />
          </div>
        }
      />

      <Card className="mb-6 border-border/80 bg-muted/10 shadow-none">
        <CardHeader className="pb-3">
          <CardTitle>Operational posture</CardTitle>
          <CardDescription>Use this before enabling automation, changing programs, or trusting downstream reporting.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {business.operationalSummary.items.map((item) => (
              <div className="rounded-xl border border-border/70 bg-background/80 p-4" key={item.id}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">{item.label}</div>
                    <div className="mt-2 text-lg font-semibold tracking-tight">{item.value}</div>
                  </div>
                  <StatusChip status={item.status} />
                </div>
                <div className="mt-2 text-sm leading-5 text-muted-foreground">{item.detail}</div>
                {item.href ? (
                  <Link className="mt-3 inline-flex text-sm font-medium hover:underline" href={item.href as Route}>
                    Open
                  </Link>
                ) : null}
              </div>
            ))}
          </div>

          {business.operationalSummary.warnings.length > 0 ? (
            <div className="rounded-xl border border-warning/35 bg-warning/10 p-4">
              <div className="text-sm font-semibold">Needs operator review</div>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                {business.operationalSummary.warnings.map((warning) => (
                  <div className="flex items-start gap-3" key={warning.id}>
                    <StatusChip status={warning.status} />
                    <div>
                      <div className="text-sm font-medium">{warning.title}</div>
                      <div className="text-sm text-muted-foreground">{warning.detail}</div>
                      {warning.href ? (
                        <Link className="mt-1 inline-flex text-sm font-medium hover:underline" href={warning.href as Route}>
                          Review
                        </Link>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-border/70 bg-background/70 px-4 py-3 text-sm text-muted-foreground">
              No posture warnings for this business.
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle>Yelp Leads onboarding</CardTitle>
                  <CardDescription>Use this before adding the business to live lead intake or autoresponder scope.</CardDescription>
                </div>
                <StatusChip status={business.yelpLeadOnboarding.status} />
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
                <div className="font-medium">{business.yelpLeadOnboarding.label}</div>
                <div className="mt-1 text-muted-foreground">{business.yelpLeadOnboarding.detail}</div>
                <div className="mt-2 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">Next action</div>
                <div className="mt-1">{business.yelpLeadOnboarding.nextAction}</div>
              </div>
              {canManageBusinesses ? (
                <div className="flex flex-wrap gap-2">
                  <BusinessYelpLeadsCheckButton businessId={business.id} disabled={!business.encryptedYelpBusinessId} />
                  <BusinessYelpSubscriptionActions
                    businessId={business.id}
                    disabled={!business.encryptedYelpBusinessId}
                  />
                </div>
              ) : null}
              <div className="grid gap-3 md:grid-cols-2">
                {business.yelpLeadOnboarding.steps.map((step) => (
                  <div className="rounded-lg border border-border/80 bg-background p-3" key={step.id}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-medium">{step.label}</div>
                        <div className="mt-1 text-sm text-muted-foreground">{step.value}</div>
                      </div>
                      <StatusChip status={step.status} />
                    </div>
                    <div className="mt-2 text-xs leading-5 text-muted-foreground">{step.detail}</div>
                    {step.href ? (
                      <Link className="mt-2 inline-flex text-xs font-medium hover:underline" href={step.href as Route}>
                        Open
                      </Link>
                    ) : null}
                  </div>
                ))}
              </div>
              <div className="rounded-lg border border-border/80 bg-background">
                <div className="border-b border-border px-4 py-3">
                  <div className="text-sm font-semibold">Connection proof</div>
                  <div className="text-xs text-muted-foreground">Last recorded evidence for intake, sync, and thread delivery.</div>
                </div>
                <div className="divide-y divide-border">
                  {business.yelpConnectionProofTrail.map((proof) => (
                    <div className="grid gap-3 px-4 py-3 text-sm md:grid-cols-[180px_1fr_auto]" key={proof.id}>
                      <div>
                        <div className="font-medium">{proof.label}</div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {proof.occurredAt ? formatDateTime(proof.occurredAt) : "No timestamp"}
                        </div>
                      </div>
                      <div>
                        <div>{proof.value}</div>
                        <div className="mt-1 text-xs leading-5 text-muted-foreground">{proof.detail}</div>
                      </div>
                      <div className="md:justify-self-end">
                        <StatusChip status={proof.status} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Launch readiness</CardTitle>
              <CardDescription>Use this before submitting a new CPC request.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <StatusChip status={business.readiness.isReadyForCpc ? "READY" : "FAILED"} />
              <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm">
                <div className="font-medium">Next move</div>
                <div className="mt-1 text-muted-foreground">
                  {business.readiness.isReadyForCpc
                    ? "Ready for a CPC launch."
                    : business.readiness.missingItems[0] ?? "Review the saved business inputs before launching."}
                </div>
              </div>
              <ul className="space-y-2 text-sm text-muted-foreground">
                {business.readiness.missingItems.length === 0 ? (
                  <li>No blocking readiness gaps detected.</li>
                ) : (
                  business.readiness.missingItems.map((item) => <li key={item}>{item}</li>)
                )}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Business profile</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div>
                <div className="text-muted-foreground">Encrypted Yelp business ID</div>
                <div className="font-mono">{business.encryptedYelpBusinessId}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Location</div>
                <div>{[business.city, business.state, business.country].filter(Boolean).join(", ") || "Not set"}</div>
              </div>
              <div>
                <div className="text-muted-foreground">ServiceTitan location</div>
                <div>{business.location?.name ?? "Not assigned"}</div>
                {business.location?.externalCrmLocationId ? (
                  <div className="mt-1 text-xs text-muted-foreground">{business.location.externalCrmLocationId}</div>
                ) : null}
              </div>
              <div>
                <div className="text-muted-foreground">Working set</div>
                <div>
                  {business.operationalSummary.counts.leads} leads · {business.operationalSummary.counts.programs} programs ·{" "}
                  {business.operationalSummary.counts.reports} schedules
                </div>
              </div>
              <div>
                <div className="text-muted-foreground">Categories</div>
                <div>{business.categories.length > 0 ? business.categories.map(formatYelpCategory).join(", ") : "No categories saved"}</div>
                {business.categories.some((category) => !category.alias) ? (
                  <div className="mt-1 text-xs text-warning">
                    Some saved categories are missing Yelp aliases. CPC programs require alias-backed categories.
                  </div>
                ) : null}
              </div>
              <div>
                <div className="text-muted-foreground">Ad eligibility</div>
                <div className="mt-1">
                  <Badge variant={eligibilityVariantMap[business.readiness.adsEligibilityStatus]}>
                    {eligibilityLabelMap[business.readiness.adsEligibilityStatus]}
                  </Badge>
                </div>
                {business.readiness.adsEligibilityMessage ? (
                  <div className="mt-1 text-xs text-muted-foreground">{business.readiness.adsEligibilityMessage}</div>
                ) : business.readiness.adsEligibilityStatus === "UNKNOWN" ? (
                  <div className="mt-1 text-xs text-muted-foreground">
                    Yelp ad eligibility is unknown until Yelp accepts or rejects an ads operation for this business.
                  </div>
                ) : null}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Live Yelp inventory</CardTitle>
              <CardDescription>
                {business.liveProgramInventory.message ?? "Yelp-native inventory. Local console records stay separate below."}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {business.liveProgramInventory.programs.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Type</TableHead>
                      <TableHead>Upstream</TableHead>
                      <TableHead>Budget / categories</TableHead>
                      <TableHead>Features</TableHead>
                      <TableHead>Console</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {business.liveProgramInventory.programs.map((program) => (
                      <TableRow key={program.program_id}>
                        <TableCell>
                          <div className="font-medium">{program.program_type}</div>
                          <div className="text-xs text-muted-foreground font-mono">{program.program_id}</div>
                        </TableCell>
                        <TableCell>
                          <StatusChip status={program.program_status} />
                          {program.program_pause_status ? (
                            <div className="mt-1 text-xs text-muted-foreground">{titleCase(program.program_pause_status)}</div>
                          ) : null}
                        </TableCell>
                        <TableCell className="space-y-1 text-sm">
                          <div>
                            {program.program_metrics?.budget != null
                              ? formatCurrency(program.program_metrics.budget, program.program_metrics.currency ?? "USD")
                              : program.page_upgrade_info?.monthly_rate != null
                                ? `${formatCurrency(Math.round(program.page_upgrade_info.monthly_rate * 100), "USD")} / mo`
                                : "Not set"}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {program.ad_categories.length > 0 ? program.ad_categories.join(", ") : "No ad categories"}
                          </div>
                        </TableCell>
                        <TableCell className="space-y-2">
                          <div className="flex flex-wrap gap-1">
                            {program.active_features.length > 0 ? (
                              program.active_features.map((feature) => (
                                <Badge key={`${program.program_id}-${feature}`} variant="success">
                                  {titleCase(feature)}
                                </Badge>
                              ))
                            ) : (
                              <span className="text-xs text-muted-foreground">No active features</span>
                            )}
                          </div>
                          {program.available_features.length > 0 ? (
                            <div className="text-xs text-muted-foreground">
                              Available: {program.available_features.map(titleCase).join(", ")}
                            </div>
                          ) : null}
                        </TableCell>
                        <TableCell>
                          {program.localProgramId ? (
                            <div className="space-y-1">
                              <Link className="font-medium hover:underline" href={`/programs/${program.localProgramId}`}>
                                Open local program
                              </Link>
                              {program.localProgramStatus ? <StatusChip status={program.localProgramStatus} /> : null}
                            </div>
                          ) : (
                            <Badge variant="outline">Upstream only</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="space-y-2 p-6 text-sm text-muted-foreground">
                  <div>No live Yelp program inventory is available for this business yet.</div>
                  {business.liveProgramInventory.message ? <div>{business.liveProgramInventory.message}</div> : null}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Local console records</CardTitle>
              <CardDescription>Programs the console is actively tracking for this business.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {business.currentPrograms.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Type</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Details</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {business.currentPrograms.map((program) => (
                      <TableRow key={program.id}>
                        <TableCell>{program.type}</TableCell>
                        <TableCell><StatusChip status={program.status} /></TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            <Link className="font-medium hover:underline" href={`/programs/${program.id}`}>
                              Open program
                            </Link>
                            <div className="text-xs text-muted-foreground">
                              {program.upstreamProgramId ? `Yelp ID ${program.upstreamProgramId}` : "No confirmed Yelp ID"}
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="space-y-3 p-6 text-sm text-muted-foreground">
                  <div>No active local programs are currently tracked for this business.</div>
                  <Link className="font-medium text-foreground hover:underline" href={`/programs/new?businessId=${business.id}`}>
                    Create the first program
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent report requests</CardTitle>
              <CardDescription>Saved Yelp batch requests for this business.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {business.reportRequests.map((report) => (
                <div className="flex items-center justify-between rounded-lg border border-border p-4" key={report.id}>
                  <Link className="font-medium hover:underline" href={`/reporting/${report.id}`}>
                    {report.granularity} report
                  </Link>
                  <StatusChip status={report.status} />
                </div>
              ))}
              {business.reportRequests.length === 0 ? (
                <div className="text-sm text-muted-foreground">No report requests have been saved for this business yet.</div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Audit timeline</CardTitle>
            </CardHeader>
            <CardContent>
              <AuditTimeline events={business.auditEvents} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
