import Link from "next/link";

import { PageHeader } from "@/components/shared/page-header";
import { StatusChip } from "@/components/shared/status-chip";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getProgramsIndex } from "@/features/ads-programs/service";
import { requireUser } from "@/lib/auth/service";
import { formatCurrency } from "@/lib/utils/format";

export default async function ProgramsPage() {
  const user = await requireUser();
  const programs = await getProgramsIndex(user.tenantId);

  return (
    <div>
      <PageHeader
        title="Programs"
        description="Create, edit, terminate, and track Yelp ad programs with job history and operational safeguards."
        actions={
          <Button asChild>
            <Link href="/programs/new">New program</Link>
          </Button>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Program inventory</CardTitle>
          <CardDescription>The latest 10 active or pending programs for the current tenant.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {programs.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Business</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Budget</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {programs.map((program) => (
                  <TableRow key={program.id}>
                    <TableCell>{program.business.name}</TableCell>
                    <TableCell>{program.type}</TableCell>
                    <TableCell><StatusChip status={program.status} /></TableCell>
                    <TableCell>{formatCurrency(program.budgetCents, program.currency)}</TableCell>
                    <TableCell>
                      <div className="flex gap-3">
                        <Link className="font-medium hover:underline" href={`/programs/${program.id}`}>
                          Open
                        </Link>
                        {program.type === "CPC" ? (
                          <Link className="text-sm text-muted-foreground hover:underline" href={`/programs/${program.id}#budget-operations`}>
                            Budget ops
                          </Link>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="p-6 text-sm text-muted-foreground">No active programs are currently available in the console.</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
