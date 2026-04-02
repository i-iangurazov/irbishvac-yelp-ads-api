import { EmptyState } from "@/components/shared/empty-state";
import { MetricCard } from "@/components/shared/metric-card";
import { PageHeader } from "@/components/shared/page-header";
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
        description="Service categories normalize inconsistent Yelp and CRM labels so per-service rollups stay explicit and reviewable."
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="Service categories" value={overview.counts.serviceCategories} description="Normalized services available for mapping rules." />
        <MetricCard title="Classified leads" value={overview.counts.classifiedLeads} description="Leads already mapped to a normalized service category." />
        <MetricCard title="Reporting snapshots" value={overview.counts.reportingSnapshots} description="Future per-service rollups will aggregate these delayed reporting snapshots." />
        <MetricCard title="Sync errors" value={overview.counts.syncErrors} description="Service mapping or enrichment issues that need operational review." />
      </div>

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
