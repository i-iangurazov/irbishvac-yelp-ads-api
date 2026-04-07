import Link from "next/link";

import { BusinessSearchForm } from "@/components/forms/business-search-form";
import { ManualBusinessForm } from "@/components/forms/manual-business-form";
import { EmptyState } from "@/components/shared/empty-state";
import { MetricCard } from "@/components/shared/metric-card";
import { PageHeader } from "@/components/shared/page-header";
import { StatusChip } from "@/components/shared/status-chip";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getBusinessesIndex } from "@/features/businesses/service";
import { requireUser } from "@/lib/auth/service";

const eligibilityVariantMap = {
  UNKNOWN: "outline",
  ELIGIBLE: "success",
  BLOCKED: "destructive"
} as const;

const eligibilityLabelMap = {
  UNKNOWN: "Unknown",
  ELIGIBLE: "Eligible",
  BLOCKED: "Blocked"
} as const;

export default async function BusinessesPage() {
  const user = await requireUser();
  const businesses = await getBusinessesIndex(user.tenantId);
  const launchReadyBusinesses = businesses.filter((business) => business.readiness.isReadyForCpc);
  const blockedBusinesses = businesses.filter((business) => business.readiness.adsEligibilityStatus === "BLOCKED");
  const activePrograms = businesses.reduce(
    (sum, business) => sum + business.programs.filter((program) => ["ACTIVE", "SCHEDULED", "QUEUED", "PROCESSING"].includes(program.status)).length,
    0
  );

  return (
    <div>
      <PageHeader
        title="Businesses"
        description="Find the right business, save it once, and move it into launch."
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="Saved businesses" value={businesses.length} description="Accounts already staged for operators." />
        <MetricCard title="Launch-ready" value={launchReadyBusinesses.length} description="Businesses that pass the current CPC readiness checks." />
        <MetricCard title="Policy blocked" value={blockedBusinesses.length} description="Businesses Yelp has already marked as ineligible for ads." />
        <MetricCard title="Current programs" value={activePrograms} description="Programs already tied to saved businesses." />
      </div>

      <div className="mt-6 rounded-2xl border border-border/80 bg-muted/15 px-5 py-4">
        <div className="grid gap-3 text-sm text-muted-foreground md:grid-cols-3">
          <div>Search first, then save the exact Yelp business you want operators to work from.</div>
          <div>Keep category aliases clean so CPC targeting is predictable when it is needed.</div>
          <div>Use the business detail page as the handoff into program launch and reporting.</div>
        </div>
      </div>

      {businesses.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            title="No businesses saved yet"
            description="Search with Business Match if it is enabled for your tenant, or save a business manually with its encrypted Yelp business ID."
          />
        </div>
      ) : (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Saved businesses</CardTitle>
            <CardDescription>Scan readiness, alias coverage, and the next move from one table.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Business</TableHead>
                  <TableHead>Eligibility</TableHead>
                  <TableHead>Alias coverage</TableHead>
                  <TableHead>Programs</TableHead>
                  <TableHead>Readiness</TableHead>
                  <TableHead>Next action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {businesses.map((business) => {
                  const aliasBackedCategories = business.categories.filter((category) => Boolean(category.alias)).length;

                  return (
                    <TableRow key={business.id}>
                      <TableCell>
                        <Link className="font-medium hover:underline" href={`/businesses/${business.id}`}>
                          {business.name}
                        </Link>
                        <div className="text-xs text-muted-foreground">
                          {[business.city, business.state].filter(Boolean).join(", ") || "Location not set"}
                        </div>
                        <div className="mt-2 text-xs text-muted-foreground">{business.encryptedYelpBusinessId}</div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-2">
                          <Badge variant={eligibilityVariantMap[business.readiness.adsEligibilityStatus]}>
                            {eligibilityLabelMap[business.readiness.adsEligibilityStatus]}
                          </Badge>
                          {business.readiness.adsEligibilityMessage ? (
                            <div className="text-xs text-muted-foreground">
                              {business.readiness.adsEligibilityMessage}
                            </div>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell>{aliasBackedCategories} / {business.categories.length}</TableCell>
                      <TableCell>{business.programs.length}</TableCell>
                      <TableCell>
                        <div className="space-y-2">
                          <StatusChip status={business.readiness.isReadyForCpc ? "READY" : "FAILED"} />
                          {!business.readiness.isReadyForCpc ? (
                            <div className="text-xs text-muted-foreground">
                              {business.readiness.missingItems[0] ?? "Needs review"}
                            </div>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell>
                        {business.readiness.isReadyForCpc ? (
                          <Link className="font-medium hover:underline" href={`/programs/new?businessId=${business.id}`}>
                            Create program
                          </Link>
                        ) : (
                          <Link className="text-sm text-muted-foreground hover:underline" href={`/businesses/${business.id}`}>
                            Fix readiness
                          </Link>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-3">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Find a business</h2>
            <p className="text-sm text-muted-foreground">Use this when you need to add a new business to the working set.</p>
          </div>
          <BusinessSearchForm />
        </div>
        <div className="space-y-3">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Manual fallback</h2>
            <p className="text-sm text-muted-foreground">Use this only when Yelp already provided the encrypted business ID.</p>
          </div>
          <ManualBusinessForm />
        </div>
      </div>
    </div>
  );
}
