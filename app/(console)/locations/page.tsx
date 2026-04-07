import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
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
        description="Foundation-only location mapping inventory. This is not a primary operator surface in the current MVP."
        actions={<Badge variant="outline">Beta</Badge>}
      />

      <Card className="border-border/70 bg-muted/20">
        <CardHeader>
          <CardTitle>Current state</CardTitle>
          <CardDescription>This page stays intentionally lightweight until per-location enrichment and reporting are truly wired.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <div>{overview.counts.locations} internal locations and {overview.counts.mappedBusinesses} mapped businesses are currently stored.</div>
          <div>Location-level operational status still depends on CRM enrichment, not Yelp.</div>
          <div>Per-location reporting is future work and is intentionally not presented as finished here.</div>
        </CardContent>
      </Card>

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
