import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getServiceCategoryOverview } from "@/features/operations/service";
import { requireUser } from "@/lib/auth/service";

export default async function ServicesPage() {
  const user = await requireUser();
  const overview = await getServiceCategoryOverview(user.tenantId);

  return (
    <div>
      <PageHeader
        title="Services"
        description="Foundation-only service mapping inventory. It remains intentionally read-only until per-service reporting and enrichment are real product workflows."
        actions={<Badge variant="outline">Beta</Badge>}
      />

      <Card className="border-border/70 bg-muted/20">
        <CardHeader>
          <CardTitle>Current state</CardTitle>
          <CardDescription>This page exists to keep the data model visible without pretending per-service operations are already in the MVP.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <div>{overview.counts.serviceCategories} normalized services are stored today.</div>
          <div>{overview.counts.classifiedLeads} leads and {overview.counts.reportingSnapshots} reporting snapshots are already available for future service-level rollups.</div>
          <div>Service mapping and related sync issues remain internal foundation work for now.</div>
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Service mapping inventory</CardTitle>
          <CardDescription>Rules stay normalized here so Yelp labels and CRM labels do not leak into each other.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {overview.serviceCategories.length === 0 ? (
            <div className="p-6">
              <EmptyState
                title="No normalized service categories yet"
                description="Define shared service categories before per-service leads and reporting views are enabled."
              />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Service</TableHead>
                  <TableHead>Slug</TableHead>
                  <TableHead>Leads</TableHead>
                  <TableHead>Reporting snapshots</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {overview.serviceCategories.map((serviceCategory) => (
                  <TableRow key={serviceCategory.id}>
                    <TableCell>{serviceCategory.name}</TableCell>
                    <TableCell>{serviceCategory.slug}</TableCell>
                    <TableCell>{serviceCategory._count.yelpLeads}</TableCell>
                    <TableCell>{serviceCategory._count.yelpReportingSnapshots}</TableCell>
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
