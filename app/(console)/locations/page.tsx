import { EmptyState } from "@/components/shared/empty-state";
import { MetricCard } from "@/components/shared/metric-card";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getLocationsOverview } from "@/features/operations/service";
import { requireUser } from "@/lib/auth/service";

export default async function LocationsPage() {
  const user = await requireUser();
  const overview = await getLocationsOverview(user.tenantId);

  return (
    <div>
      <PageHeader
        title="Locations"
        description="Internal locations will anchor Yelp business mappings, service ownership, and per-location reporting once the ingestion layers are connected."
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="Locations" value={overview.counts.locations} description="Internal locations available for Yelp business mapping." />
        <MetricCard title="Mapped businesses" value={overview.counts.mappedBusinesses} description="Yelp businesses already assigned to an internal location." />
        <MetricCard title="Normalized leads" value={overview.counts.totalLeads} description="Leads that can eventually roll up by location." />
        <MetricCard
          title="CRM enrichment"
          value={overview.hasCrmIntegration ? "On" : "Off"}
          description="Location-level operational status depends on CRM enrichment, not Yelp."
        />
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Location directory</CardTitle>
          <CardDescription>One Yelp business maps to one internal location today, with room to extend later.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {overview.locations.length === 0 ? (
            <div className="p-6">
              <EmptyState
                title="No internal locations defined yet"
                description="Add CRM-backed locations before enabling per-location lead ownership and reporting rollups."
              />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>Mapped businesses</TableHead>
                  <TableHead>Leads</TableHead>
                  <TableHead>CRM status events</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {overview.locations.map((location) => (
                  <TableRow key={location.id}>
                    <TableCell>{location.name}</TableCell>
                    <TableCell>{location.code ?? "Not set"}</TableCell>
                    <TableCell>{location._count.businesses}</TableCell>
                    <TableCell>{location._count.yelpLeads}</TableCell>
                    <TableCell>{location._count.crmStatusEvents}</TableCell>
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
