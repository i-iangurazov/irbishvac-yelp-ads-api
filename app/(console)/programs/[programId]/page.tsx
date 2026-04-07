import Link from "next/link";

import { ProgramBudgetOperations } from "@/components/forms/program-budget-operations";
import { JobStatusPoller } from "@/components/forms/job-status-poller";
import { ProgramForm } from "@/components/forms/program-form";
import { ProgramTerminateForm } from "@/components/forms/program-terminate-form";
import { AuditTimeline } from "@/components/shared/audit-timeline";
import { JsonViewer } from "@/components/shared/json-viewer";
import { PageHeader } from "@/components/shared/page-header";
import { StatusChip } from "@/components/shared/status-chip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getProgramDetail } from "@/features/ads-programs/service";
import { getBusinessesIndex } from "@/features/businesses/service";
import { requireUser } from "@/lib/auth/service";
import { formatCurrency, formatDateTime, titleCase } from "@/lib/utils/format";
import { getCapabilityFlags } from "@/lib/yelp/runtime";

function normalizePacingMethod(value?: string) {
  if (value === "STANDARD") {
    return "paced" as const;
  }

  if (value === "ACCELERATED") {
    return "unpaced" as const;
  }

  return value === "unpaced" ? "unpaced" : "paced";
}

function normalizeFeePeriod(value?: string) {
  if (value === "MONTHLY") {
    return "CALENDAR_MONTH" as const;
  }

  if (value === "WEEKLY") {
    return "ROLLING_MONTH" as const;
  }

  return value === "ROLLING_MONTH" ? "ROLLING_MONTH" : "CALENDAR_MONTH";
}

export default async function ProgramDetailPage({
  params,
  searchParams
}: {
  params: Promise<{ programId: string }>;
  searchParams: Promise<{ jobId?: string }>;
}) {
  const user = await requireUser();
  const { programId } = await params;
  const query = await searchParams;
  const [program, businesses, capabilities] = await Promise.all([
    getProgramDetail(user.tenantId, programId),
    getBusinessesIndex(user.tenantId),
    getCapabilityFlags(user.tenantId)
  ]);
  const configuration = typeof program.configurationJson === "object" && program.configurationJson !== null ? (program.configurationJson as Record<string, unknown>) : {};
  const scheduledBudgetDollars = typeof configuration.scheduledBudgetDollars === "string" ? configuration.scheduledBudgetDollars : undefined;
  const scheduledBudgetEffectiveDate =
    typeof configuration.scheduledBudgetEffectiveDate === "string" ? configuration.scheduledBudgetEffectiveDate : undefined;
  const latestJob = program.jobs[0];
  const terminateDisabledReason =
    capabilities.demoModeEnabled && !capabilities.adsApiEnabled
      ? undefined
      : program.status === "ENDED"
        ? "This program is already ended."
        : program.status === "QUEUED" || program.status === "PROCESSING"
          ? "Wait for the current Yelp job to finish before terminating the program."
          : !program.upstreamProgramId
            ? "This program does not have a confirmed Yelp program ID yet, so there is nothing upstream to terminate."
            : undefined;
  const terminationReadiness = terminateDisabledReason ?? "Ready to submit to Yelp.";

  return (
    <div>
      <PageHeader
        title={`${program.type} program`}
        description="Review local state, the latest Yelp job, and what is actually settled upstream."
        actions={
          <div className="flex flex-wrap gap-3">
            {program.type === "CPC" ? (
              <Button asChild variant="outline">
                <Link href="#budget-operations">Budget</Link>
              </Button>
            ) : null}
            <Button asChild variant="outline">
              <Link href={`/program-features/${program.id}`}>Features</Link>
            </Button>
            <ProgramTerminateForm programId={program.id} disabledReason={terminateDisabledReason} />
          </div>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Program summary</CardTitle>
              <CardDescription>Local status and upstream confirmation can diverge while Yelp is still processing.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm md:grid-cols-2">
              <div>
                <div className="text-muted-foreground">Business</div>
                <Link className="font-medium hover:underline" href={`/businesses/${program.businessId}`}>
                  {program.business.name}
                </Link>
              </div>
              <div>
                <div className="text-muted-foreground">Local status</div>
                <StatusChip status={program.status} />
              </div>
              <div>
                <div className="text-muted-foreground">Budget</div>
                <div>{formatCurrency(program.budgetCents, program.currency)}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Max bid</div>
                <div>{formatCurrency(program.maxBidCents, program.currency)}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Pacing</div>
                <div>{program.pacingMethod ?? "Not set"}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Yelp program ID</div>
                <div>{program.upstreamProgramId ?? "Not assigned yet"}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Last sync</div>
                <div>{program.lastSyncedAt ? formatDateTime(program.lastSyncedAt) : "Not synced back from Yelp yet"}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Latest Yelp job</div>
                <div>{latestJob ? formatDateTime(latestJob.createdAt) : "No job recorded yet"}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Scheduled budget</div>
                <div>
                  {scheduledBudgetDollars && scheduledBudgetEffectiveDate
                    ? `${scheduledBudgetDollars} effective ${scheduledBudgetEffectiveDate}`
                    : "None scheduled"}
                </div>
              </div>
              <div className="md:col-span-2">
                <div className="text-muted-foreground">Termination readiness</div>
                <div>{terminationReadiness}</div>
              </div>
            </CardContent>
          </Card>

          {program.type === "CPC" ? (
            <ProgramBudgetOperations
              programId={program.id}
              currency={program.currency}
              currentBudgetCents={program.budgetCents}
              currentMaxBidCents={program.maxBidCents}
              currentPacingMethod={program.pacingMethod}
              isAutobid={program.isAutobid}
              scheduledBudgetDollars={scheduledBudgetDollars}
              scheduledBudgetEffectiveDate={scheduledBudgetEffectiveDate}
            />
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Budget operations</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                Budget operations are currently available for CPC programs only. Open a CPC program detail page to change current budget, schedule a future budget, or update pacing and max bid.
              </CardContent>
            </Card>
          )}

          <ProgramForm
            mode="edit"
            programId={program.id}
            businesses={businesses.map((business) => ({
              id: business.id,
              name: business.name,
              categories: business.categories,
              readiness: business.readiness
            }))}
            initialValues={{
              businessId: program.businessId,
              programType: program.type,
              currency: program.currency,
              monthlyBudgetDollars: program.budgetCents ? String(program.budgetCents / 100) : "",
              maxBidDollars: program.maxBidCents ? String(program.maxBidCents / 100) : "",
              isAutobid: program.isAutobid ?? true,
              pacingMethod: normalizePacingMethod(program.pacingMethod ?? undefined),
              feePeriod: normalizeFeePeriod(program.feePeriod ?? undefined),
              adCategories: Array.isArray(program.adCategoriesJson) ? (program.adCategoriesJson as string[]) : [],
              notes: typeof program.configurationJson === "object" && program.configurationJson !== null && "notes" in program.configurationJson ? String((program.configurationJson as Record<string, unknown>).notes ?? "") : ""
            }}
          />

          <Card>
            <CardHeader>
              <CardTitle>Audit timeline</CardTitle>
            </CardHeader>
            <CardContent>
              <AuditTimeline events={program.auditEvents} />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          {query.jobId ? <JobStatusPoller jobId={query.jobId} /> : null}

          <Card>
            <CardHeader>
              <CardTitle>Record boundaries</CardTitle>
              <CardDescription>Keep upstream state, local state, and audit notes separate.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="rounded-lg border border-border p-4">
                <div className="flex items-center gap-2">
                  <Badge>Yelp-native</Badge>
                  <span className="font-medium">Program IDs, live status, accepted budget changes</span>
                </div>
                <div className="mt-2 text-xs text-muted-foreground">Final only after Yelp finishes the job.</div>
              </div>
              <div className="rounded-lg border border-border p-4">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">Local console</Badge>
                  <span className="font-medium">Drafted configuration, queue state, operator notes</span>
                </div>
                <div className="mt-2 text-xs text-muted-foreground">Saved immediately so operators can track intent.</div>
              </div>
              <div className="rounded-lg border border-border p-4">
                <div className="flex items-center gap-2">
                  <Badge variant="outline">Audit only</Badge>
                  <span className="font-medium">Terminate reason and requested end date</span>
                </div>
                <div className="mt-2 text-xs text-muted-foreground">Stored internally. Not sent to Yelp.</div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent Yelp jobs</CardTitle>
              <CardDescription>Use this when the local record looks ahead of Yelp.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {program.jobs.length === 0 ? (
                <div className="text-sm text-muted-foreground">No jobs have been recorded for this program yet.</div>
              ) : (
                program.jobs.slice(0, 5).map((job) => (
                  <div className="rounded-lg border border-border p-4" key={job.id}>
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <div className="font-medium">{titleCase(job.type.toLowerCase().replaceAll("_", " "))}</div>
                        <div className="text-sm text-muted-foreground">
                          {formatDateTime(job.createdAt)} {job.upstreamJobId ? `• ${job.upstreamJobId}` : ""}
                        </div>
                      </div>
                      <StatusChip status={job.status} />
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Saved payload</CardTitle>
              <CardDescription>The last request state saved on the local record.</CardDescription>
            </CardHeader>
            <CardContent>
              <JsonViewer value={program.configurationJson} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
