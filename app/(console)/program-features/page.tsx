import Link from "next/link";

import { CapabilityState } from "@/components/shared/capability-state";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { StatusChip } from "@/components/shared/status-chip";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getProgramsIndex } from "@/features/ads-programs/service";
import { getSettingsOverview } from "@/features/settings/service";
import { requirePermission } from "@/lib/auth/service";
import { formatCurrency } from "@/lib/utils/format";

export default async function ProgramFeaturesIndexPage() {
  const user = await requirePermission("features:read");
  const [programs, settings] = await Promise.all([
    getProgramsIndex(user.tenantId),
    getSettingsOverview(user.tenantId)
  ]);

  return (
    <div>
      <PageHeader
        title="Program Features"
        description="Feature settings are applied per Yelp program. Choose a program below to manage link tracking, targeting, scheduling, custom creative, and other supported features."
      />

      <CapabilityState
        enabled={settings.capabilities.programFeatureApiEnabled}
        message={
          settings.capabilities.programFeatureApiEnabled
            ? "Program Feature API access is enabled for this tenant."
            : "Program Feature API is not enabled by Yelp or credentials are not configured yet."
        }
      />

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Choose a program</CardTitle>
          <CardDescription>
            Open a program to view current feature snapshots, compare values, and submit changes safely.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {programs.length === 0 ? (
            <div className="p-6">
              <EmptyState
                title="No programs yet"
                description="Create a Yelp program first, then manage its feature settings from this section."
                action={
                  <Button asChild>
                    <Link href="/programs/new">Create program</Link>
                  </Button>
                }
              />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Business</TableHead>
                  <TableHead>Program</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Budget</TableHead>
                  <TableHead>Features</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {programs.map((program) => (
                  <TableRow key={program.id}>
                    <TableCell>{program.business.name}</TableCell>
                    <TableCell>{program.type}</TableCell>
                    <TableCell>
                      <StatusChip status={program.status} />
                    </TableCell>
                    <TableCell>{formatCurrency(program.budgetCents, program.currency)}</TableCell>
                    <TableCell>
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/program-features/${program.id}`}>Manage features</Link>
                      </Button>
                    </TableCell>
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
