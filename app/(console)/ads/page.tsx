import Link from "next/link";

import { CapabilityState } from "@/components/shared/capability-state";
import { MetricCard } from "@/components/shared/metric-card";
import { PageHeader } from "@/components/shared/page-header";
import { StatusChip } from "@/components/shared/status-chip";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getAdsWorkspaceOverview } from "@/features/operations/service";
import { requireUser } from "@/lib/auth/service";
import { formatCurrency } from "@/lib/utils/format";

export default async function AdsPage() {
  const user = await requireUser();
  const overview = await getAdsWorkspaceOverview(user.tenantId);

  return (
    <div>
      <PageHeader
        title="Ads"
        description="Existing Yelp Ads workflows stay intact here: business inventory, program management, feature controls, and the current reporting entrypoints."
        actions={
          <div className="flex gap-3">
            <Button asChild>
              <Link href="/programs/new">Create program</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/businesses">Open businesses</Link>
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="Businesses" value={overview.businesses.length} description="Saved Yelp businesses available to the Ads workspace." />
        <MetricCard title="Programs" value={overview.programs.length} description="Active, scheduled, or pending Ads programs." />
        <MetricCard title="Reports" value={overview.reports.length} description="Existing Yelp reporting requests and cached results." />
        <MetricCard
          title="Feature Controls"
          value={overview.capabilities.programFeatureApiEnabled ? "On" : "Off"}
          description="Separate Program Features API capability for feature-level mutations."
        />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <Card>
          <CardHeader>
            <CardTitle>Ads workspace</CardTitle>
            <CardDescription>These are the current production Ads surfaces already present in the console.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <Button asChild className="justify-start" variant="outline">
              <Link href="/businesses">Businesses</Link>
            </Button>
            <Button asChild className="justify-start" variant="outline">
              <Link href="/programs">Programs</Link>
            </Button>
            <Button asChild className="justify-start" variant="outline">
              <Link href="/program-features">Program Features</Link>
            </Button>
            <Button asChild className="justify-start" variant="outline">
              <Link href="/reporting">Reporting</Link>
            </Button>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <CapabilityState
            enabled={overview.capabilities.hasAdsApi}
            message={
              overview.capabilities.hasAdsApi
                ? "Live Yelp Ads operations are enabled for this tenant."
                : "Ads requests remain blocked until Yelp Ads API access and credentials are enabled."
            }
          />
          <CapabilityState
            enabled={overview.capabilities.programFeatureApiEnabled}
            message={
              overview.capabilities.programFeatureApiEnabled
                ? "Program feature reads and writes are enabled."
                : "Feature controls remain unavailable until the dedicated Program Features API is enabled."
            }
          />
        </div>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Recent programs</CardTitle>
          <CardDescription>The Ads workspace keeps using the existing dense operational inventory pattern.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Business</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Budget</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {overview.programs.map((program) => (
                <TableRow key={program.id}>
                  <TableCell>{program.business.name}</TableCell>
                  <TableCell>{program.type}</TableCell>
                  <TableCell>
                    <StatusChip status={program.status} />
                  </TableCell>
                  <TableCell>{formatCurrency(program.budgetCents, program.currency)}</TableCell>
                  <TableCell>
                    <Link className="font-medium hover:underline" href={`/programs/${program.id}`}>
                      Open
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
