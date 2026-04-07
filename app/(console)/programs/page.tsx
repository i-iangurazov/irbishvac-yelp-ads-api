import Link from "next/link";

import { MetricCard } from "@/components/shared/metric-card";
import { PageHeader } from "@/components/shared/page-header";
import { StatusChip } from "@/components/shared/status-chip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getProgramsIndex } from "@/features/ads-programs/service";
import { requireUser } from "@/lib/auth/service";
import { formatCurrency, formatDateTime, titleCase } from "@/lib/utils/format";

export default async function ProgramsPage() {
  const user = await requireUser();
  const programs = await getProgramsIndex(user.tenantId);
  const activePrograms = programs.filter((program) => program.status === "ACTIVE");
  const waitingOnYelp = programs.filter((program) => program.status === "QUEUED" || program.status === "PROCESSING");
  const unsyncedPrograms = programs.filter((program) => !program.upstreamProgramId);
  const recentFailures = programs.filter((program) => program.jobs.some((job) => job.status === "FAILED" || job.status === "PARTIAL"));

  return (
    <div>
      <PageHeader
        title="Programs"
        description="Manage live and in-flight Yelp program requests from one queue."
        actions={
          <Button asChild>
            <Link href="/programs/new">New program</Link>
          </Button>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="Current programs" value={programs.length} description="Active or in-flight local records." />
        <MetricCard title="Active" value={activePrograms.length} description="Programs already marked active locally." />
        <MetricCard title="Waiting on Yelp" value={waitingOnYelp.length} description="Queued or processing changes that are still settling upstream." />
        <MetricCard title="Needs review" value={recentFailures.length + unsyncedPrograms.length} description="Programs with failed jobs or without a confirmed Yelp program ID." />
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-2 rounded-2xl border border-border/80 bg-muted/15 px-4 py-3 text-xs text-muted-foreground">
        <Badge variant="secondary">Local record</Badge>
        <Badge variant="outline">Latest Yelp job</Badge>
        <Badge variant="outline">Confirmed Yelp ID</Badge>
        <span>Read all three together when a program is still in flight.</span>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Program inventory</CardTitle>
          <CardDescription>Scan local status, the last Yelp job, and upstream confirmation from one table.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {programs.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Business</TableHead>
                  <TableHead>Program</TableHead>
                  <TableHead>Budget</TableHead>
                  <TableHead>Latest Yelp job</TableHead>
                  <TableHead>Yelp ID</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {programs.map((program) => {
                  const latestJob = program.jobs[0];

                  return (
                    <TableRow key={program.id}>
                      <TableCell>
                        <Link className="font-medium hover:underline" href={`/businesses/${program.businessId}`}>
                          {program.business.name}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{program.type}</div>
                        <div className="mt-2">
                          <StatusChip status={program.status} />
                        </div>
                      </TableCell>
                      <TableCell>{formatCurrency(program.budgetCents, program.currency)}</TableCell>
                      <TableCell>
                        {latestJob ? (
                          <div className="space-y-1">
                            <div className="text-sm font-medium">{titleCase(latestJob.type.toLowerCase().replaceAll("_", " "))}</div>
                            <div className="text-xs text-muted-foreground">{formatDateTime(latestJob.createdAt)}</div>
                            <StatusChip status={latestJob.status} />
                          </div>
                        ) : (
                          <div className="text-sm text-muted-foreground">No job recorded yet</div>
                        )}
                      </TableCell>
                      <TableCell>{program.upstreamProgramId ?? "Pending confirmation"}</TableCell>
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
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <div className="space-y-2 p-6 text-sm text-muted-foreground">
              <div>No active programs are currently available in the console.</div>
              <Link className="font-medium text-foreground hover:underline" href="/programs/new">
                Create the first program
              </Link>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
