import Link from "next/link";

import { MetricCard } from "@/components/shared/metric-card";
import { PageHeader } from "@/components/shared/page-header";
import { ProgramCategoryList } from "@/components/shared/program-category-list";
import { StatusChip } from "@/components/shared/status-chip";
import { YelpBudgetDisplay } from "@/components/shared/yelp-budget-display";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getProgramsIndex } from "@/features/ads-programs/service";
import { programTypeLabels } from "@/features/ads-programs/schemas";
import { analyzeBusinessCpcTargeting } from "@/features/ads-programs/targeting";
import { requireUser } from "@/lib/auth/service";
import { formatCurrency, formatDateTime, titleCase } from "@/lib/utils/format";

export default async function ProgramsPage() {
  const user = await requireUser();
  const programs = await getProgramsIndex(user.tenantId);
  const activePrograms = programs.filter(
    (program) => program.status === "ACTIVE",
  );
  const waitingOnYelp = programs.filter(
    (program) => program.status === "QUEUED" || program.status === "PROCESSING",
  );
  const unsyncedPrograms = programs.filter(
    (program) => !program.upstreamProgramId,
  );
  const recentFailures = programs.filter((program) =>
    program.jobs.some(
      (job) => job.status === "FAILED" || job.status === "PARTIAL",
    ),
  );
  const programsByBusiness = new Map<string, (typeof programs)[number][]>();

  for (const program of programs) {
    const existing = programsByBusiness.get(program.businessId) ?? [];
    existing.push(program);
    programsByBusiness.set(program.businessId, existing);
  }

  const targetingIssues = [...programsByBusiness.values()].flatMap(
    (businessPrograms) =>
      analyzeBusinessCpcTargeting(
        businessPrograms,
        businessPrograms[0]?.business.categoriesJson,
      ).map((issue) => ({
        ...issue,
        businessId: businessPrograms[0]!.businessId,
        businessName: businessPrograms[0]!.business.name,
      })),
  );

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
        <MetricCard
          title="Current programs"
          value={programs.length}
          description="Active or in-flight local records."
        />
        <MetricCard
          title="Active"
          value={activePrograms.length}
          description="Programs already marked active locally."
        />
        <MetricCard
          title="Waiting on Yelp"
          value={waitingOnYelp.length}
          description="Queued or processing changes that are still settling upstream."
        />
        <MetricCard
          title="Needs review"
          value={
            recentFailures.length +
            unsyncedPrograms.length +
            targetingIssues.length
          }
          description="Failed jobs, missing Yelp IDs, or targeting integrity problems."
        />
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-2 rounded-lg border border-border/80 bg-muted/15 px-4 py-3 text-xs text-muted-foreground">
        <Badge variant="secondary">Local record</Badge>
        <Badge variant="outline">Latest Yelp job</Badge>
        <Badge variant="outline">Confirmed Yelp ID</Badge>
        <span>Read all three together when a program is still in flight.</span>
      </div>

      {targetingIssues.length > 0 ? (
        <div className="mt-6 rounded-lg border border-destructive/35 bg-destructive/5 p-4">
          <div className="font-semibold text-destructive">
            CPC targeting requires immediate review
          </div>
          <div className="mt-1 text-sm text-muted-foreground">
            These checks compare every current CPC program with the saved Yelp
            listing categories, including programs imported from outside this
            console.
          </div>
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {targetingIssues.map((issue, index) => (
              <div
                className="rounded-lg border border-destructive/20 bg-background/80 p-3"
                key={`${issue.businessId}-${issue.code}-${index}`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="destructive">{issue.code}</Badge>
                  <Link
                    className="font-medium hover:underline"
                    href={`/businesses/${issue.businessId}`}
                  >
                    {issue.businessName}
                  </Link>
                </div>
                <div className="mt-2 text-sm font-medium">{issue.title}</div>
                <div className="mt-1 text-sm text-muted-foreground">
                  {issue.description}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Program inventory</CardTitle>
          <CardDescription>
            All {programs.length} current{" "}
            {programs.length === 1 ? "program" : "programs"}, with local status,
            the latest Yelp job, and upstream confirmation.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {programs.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Business</TableHead>
                  <TableHead>Program</TableHead>
                  <TableHead>Ad categories</TableHead>
                  <TableHead>Budget</TableHead>
                  <TableHead>Latest Yelp job</TableHead>
                  <TableHead>Yelp ID</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {programs.map((program) => {
                  const latestJob = program.jobs[0];
                  const configuration =
                    typeof program.configurationJson === "object" &&
                    program.configurationJson !== null
                      ? (program.configurationJson as Record<string, unknown>)
                      : {};
                  const importedFromYelp =
                    configuration.syncImportedFromYelp === true;

                  return (
                    <TableRow key={program.id}>
                      <TableCell>
                        <Link
                          className="font-medium hover:underline"
                          href={`/businesses/${program.businessId}`}
                        >
                          {program.business.name}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">
                          {programTypeLabels[program.type]}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {program.type} ·{" "}
                          {program.type === "CPC"
                            ? "Advertising campaign"
                            : "Profile product"}
                        </div>
                        <div className="mt-2">
                          <StatusChip status={program.status} />
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {importedFromYelp
                            ? program.jobs.length > 0
                              ? "Imported from Yelp · now managed here"
                              : "Imported from Yelp · no originating job here"
                            : "Managed in this console"}
                        </div>
                      </TableCell>
                      <TableCell className="max-w-sm">
                        <ProgramCategoryList
                          categories={program.adCategoriesJson}
                          categoryCatalog={program.business.categoriesJson}
                          programType={program.type}
                        />
                      </TableCell>
                      <TableCell>
                        {program.type === "CPC" ? (
                          <YelpBudgetDisplay
                            monthlyBudgetCents={program.budgetCents}
                            currency={program.currency}
                          />
                        ) : (
                          formatCurrency(program.budgetCents, program.currency)
                        )}
                      </TableCell>
                      <TableCell>
                        {latestJob ? (
                          <div className="space-y-1">
                            <div className="text-sm font-medium">
                              {titleCase(
                                latestJob.type
                                  .toLowerCase()
                                  .replaceAll("_", " "),
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {formatDateTime(latestJob.createdAt)}
                            </div>
                            <StatusChip status={latestJob.status} />
                          </div>
                        ) : (
                          <div className="text-sm text-muted-foreground">
                            No job recorded yet
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        {program.upstreamProgramId ?? "Pending confirmation"}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-3">
                          <Link
                            className="font-medium hover:underline"
                            href={`/programs/${program.id}`}
                          >
                            Open
                          </Link>
                          {program.type === "CPC" ? (
                            <Link
                              className="text-sm text-muted-foreground hover:underline"
                              href={`/programs/${program.id}#budget-operations`}
                            >
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
              <div>
                No active programs are currently available in the console.
              </div>
              <Link
                className="font-medium text-foreground hover:underline"
                href="/programs/new"
              >
                Create the first program
              </Link>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
