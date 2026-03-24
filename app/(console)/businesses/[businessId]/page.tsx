import Link from "next/link";

import { BusinessDeleteForm } from "@/components/forms/business-delete-form";
import { AuditTimeline } from "@/components/shared/audit-timeline";
import { PageHeader } from "@/components/shared/page-header";
import { StatusChip } from "@/components/shared/status-chip";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getBusinessDetail } from "@/features/businesses/service";
import { requireUser } from "@/lib/auth/service";
import { formatCurrency, titleCase } from "@/lib/utils/format";
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
        description="Review business identifiers, readiness, current program inventory, recent reports, and the audit trail for this account."
        actions={
          <BusinessDeleteForm
            businessId={business.id}
            businessName={business.name}
            deleteImpact={business.deleteImpact}
            disabledReason={deleteDisabledReason}
          />
        }
      />

      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="space-y-6">
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

          <Card>
            <CardHeader>
              <CardTitle>Readiness check</CardTitle>
              <CardDescription>Required before enabling CPC.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <StatusChip status={business.readiness.isReadyForCpc ? "READY" : "FAILED"} />
              <ul className="space-y-2 text-sm text-muted-foreground">
                {business.readiness.missingItems.length === 0 ? (
                  <li>No blocking readiness gaps detected.</li>
                ) : (
                  business.readiness.missingItems.map((item) => <li key={item}>{item}</li>)
                )}
              </ul>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Programs</CardTitle>
              <CardDescription>Live Yelp inventory merged with local console tracking.</CardDescription>
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
              <CardDescription>Programs saved in this console, including queued or upstream-unmatched records.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {business.programs.map((program) => (
                    <TableRow key={program.id}>
                      <TableCell>{program.type}</TableCell>
                      <TableCell><StatusChip status={program.status} /></TableCell>
                      <TableCell>
                        <Link className="font-medium hover:underline" href={`/programs/${program.id}`}>
                          Open program
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent report requests</CardTitle>
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
