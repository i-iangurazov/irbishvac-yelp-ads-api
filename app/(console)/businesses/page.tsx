import Link from "next/link";

import { BusinessSearchForm } from "@/components/forms/business-search-form";
import { ManualBusinessForm } from "@/components/forms/manual-business-form";
import { EmptyState } from "@/components/shared/empty-state";
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

  return (
    <div>
      <PageHeader
        title="Businesses"
        description="Search saved businesses, manually add businesses with encrypted Yelp IDs, and keep Yelp category aliases ready for CPC submission."
      />

      <BusinessSearchForm />
      <div className="mt-6">
        <ManualBusinessForm />
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
            <CardDescription>Businesses already available inside the console.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Business</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Programs</TableHead>
                  <TableHead>Ad eligibility</TableHead>
                  <TableHead>Readiness</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {businesses.map((business) => (
                  <TableRow key={business.id}>
                    <TableCell>
                      <Link className="font-medium hover:underline" href={`/businesses/${business.id}`}>
                        {business.name}
                      </Link>
                      <div className="text-xs text-muted-foreground">{business.encryptedYelpBusinessId}</div>
                    </TableCell>
                    <TableCell>{[business.city, business.state].filter(Boolean).join(", ") || "Not set"}</TableCell>
                    <TableCell>{business.programs.length}</TableCell>
                    <TableCell>
                      <Badge variant={eligibilityVariantMap[business.readiness.adsEligibilityStatus]}>
                        {eligibilityLabelMap[business.readiness.adsEligibilityStatus]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <StatusChip status={business.readiness.isReadyForCpc ? "READY" : "FAILED"} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
