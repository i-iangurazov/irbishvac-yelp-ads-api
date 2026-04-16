import Link from "next/link";
import { AlertTriangle, BarChart3, Building2, CircleOff, Clock4, Inbox, Megaphone, SearchCheck, Settings2 } from "lucide-react";

import { MetricCard } from "@/components/shared/metric-card";
import { PageHeader } from "@/components/shared/page-header";
import { StatusChip } from "@/components/shared/status-chip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import { getBusinessesIndex } from "@/features/businesses/service";
import { getLeadsIndex } from "@/features/leads/service";
import { getProgramsIndex } from "@/features/ads-programs/service";
import { getReportingIndex } from "@/features/reporting/service";
import { getSettingsOverview } from "@/features/settings/service";
import { getCredentialHealthViewModel, getEnabledCapabilityLabels } from "@/features/settings/view-models";
import { requireUser } from "@/lib/auth/service";
import { formatDateTime } from "@/lib/utils/format";

const eligibilityVariantMap = {
  UNKNOWN: "outline",
  ELIGIBLE: "success",
  BLOCKED: "destructive"
} as const;

const eligibilityLabelMap = {
  UNKNOWN: "Unknown",
  ELIGIBLE: "Eligible",
  BLOCKED: "Blocked by Yelp policy"
} as const;

export default async function DashboardPage() {
  const user = await requireUser();
  const [businesses, leadsOverview, programs, reports, settings] = await Promise.all([
    getBusinessesIndex(user.tenantId),
    getLeadsIndex(user.tenantId),
    getProgramsIndex(user.tenantId),
    getReportingIndex(user.tenantId),
    getSettingsOverview(user.tenantId)
  ]);

  const failedJobs = programs.flatMap((program) => program.jobs).filter((job) => job.status === "FAILED" || job.status === "PARTIAL");
  const readinessIssues = businesses.filter((business) => !business.readiness.isReadyForCpc);
  const launchReadyBusinesses = businesses.filter((business) => business.readiness.isReadyForCpc);
  const activePrograms = programs.filter((program) => ["ACTIVE", "SCHEDULED", "QUEUED", "PROCESSING"].includes(program.status));
  const enabledApis = getEnabledCapabilityLabels(settings.capabilities);
  const credentialHealth = settings.credentials.map((credential) => ({
    credential,
    health: getCredentialHealthViewModel(credential)
  }));
  const credentialBlockers = credentialHealth.filter(
    ({ health }) => health.setupLabel !== "Credentials saved" || health.requestsLabel !== "Requests enabled" || health.testVariant === "destructive"
  );

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Start here: keep Yelp intake flowing, clear blockers, and review delayed reporting."
        actions={
          <div className="flex gap-3">
            <Button asChild>
              <Link href="/leads">Leads</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/programs">Programs</Link>
            </Button>
          </div>
        }
      />

      {credentialBlockers.length > 0 ? (
        <div className="mb-6 rounded-2xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm">
          <div className="font-medium text-warning">Live Yelp work is partially blocked</div>
          <div className="mt-1 text-muted-foreground">
            Resolve credential or request-enablement issues in Settings before trusting live business search, program changes, or reporting.
          </div>
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <MetricCard title="Launch-ready businesses" value={launchReadyBusinesses.length} description="Saved businesses that can move directly into CPC creation." icon={<SearchCheck className="h-5 w-5 text-muted-foreground" />} />
        <MetricCard title="Unmapped leads" value={leadsOverview.summary.unresolvedLeads} description="Leads still waiting on an internal CRM link." icon={<Inbox className="h-5 w-5 text-muted-foreground" />} />
        <MetricCard title="Current programs" value={activePrograms.length} description="Programs that are active now or still waiting on Yelp job completion." icon={<Megaphone className="h-5 w-5 text-muted-foreground" />} />
        <MetricCard title="Reports waiting on Yelp" value={reports.summary.pendingCount} description="Batch report requests that are not final yet." icon={<Clock4 className="h-5 w-5 text-muted-foreground" />} />
        <MetricCard title="Attention needed" value={failedJobs.length} description="Failed or partially completed Yelp jobs that need operator review." icon={<AlertTriangle className="h-5 w-5 text-warning" />} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <Card>
          <CardHeader>
            <CardTitle>Environment readiness</CardTitle>
            <CardDescription>What is live right now, what is blocked, and where to fix it.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border border-border bg-muted/40 p-4">
              <div className="text-sm font-medium">Enabled surfaces</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {enabledApis.length > 0 ? enabledApis.map((label) => <Badge key={label}>{label}</Badge>) : <Badge variant="outline">None enabled yet</Badge>}
              </div>
              {settings.capabilities.demoModeEnabled ? (
                <div className="mt-3 text-xs text-muted-foreground">
                  Demo mode is on. Some flows may complete locally without a live Yelp request.
                </div>
              ) : null}
            </div>
            {credentialBlockers.length === 0 ? (
              <div className="rounded-lg border border-success/30 bg-success/5 p-4">
                <div className="text-sm font-medium">No immediate credential blockers</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  Saved credentials are present, enabled, and not failing live checks.
                </div>
              </div>
            ) : (
              credentialBlockers.map(({ credential, health }) => (
                <div className="rounded-lg border border-border p-4" key={credential.id}>
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="space-y-1">
                      <div className="font-medium">{credential.label}</div>
                      <div className="text-sm text-muted-foreground">{credential.baseUrl ?? "Base URL not set"}</div>
                      <div className="text-sm text-muted-foreground">{health.detail}</div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={health.setupVariant}>{health.setupLabel}</Badge>
                      <Badge variant={health.requestsVariant}>{health.requestsLabel}</Badge>
                      <Badge variant={health.testVariant}>{health.testLabel}</Badge>
                    </div>
                  </div>
                </div>
              ))
            )}
            <Button asChild className="w-full justify-start" variant="outline">
              <Link href="/settings">
                <Settings2 className="mr-2 h-4 w-4" />
                Open settings
              </Link>
            </Button>
          </CardContent>
        </Card>

          <Card>
          <CardHeader>
            <CardTitle>Next actions</CardTitle>
            <CardDescription>Jump straight into the next useful action.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <Button asChild className="justify-start">
              <Link href="/leads">
                <Inbox className="mr-2 h-4 w-4" />
                Review lead queue
              </Link>
            </Button>
            <Button asChild className="justify-start" variant="outline">
              <Link href="/businesses">
                <Building2 className="mr-2 h-4 w-4" />
                Review business readiness
              </Link>
            </Button>
            <Button asChild className="justify-start" variant="outline">
              <Link href="/programs/new">
                <Megaphone className="mr-2 h-4 w-4" />
                Create a program
              </Link>
            </Button>
            <Button asChild className="justify-start" variant="outline">
              <Link href="/reporting">
                <BarChart3 className="mr-2 h-4 w-4" />
                Request a batch report
              </Link>
            </Button>
            <Button asChild className="justify-start" variant="outline">
              <Link href="/audit">
                <AlertTriangle className="mr-2 h-4 w-4" />
                Review audit and sync issues
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Failed jobs needing attention</CardTitle>
            <CardDescription>Requests that need follow-up before operators trust the local state.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {failedJobs.length === 0 ? (
              <EmptyState title="No failed jobs" description="Recent Yelp jobs completed successfully or none have been submitted yet." />
            ) : (
              failedJobs.slice(0, 6).map((job) => (
                <div className="flex items-center justify-between rounded-lg border border-border p-4" key={job.id}>
                  <div>
                    <div className="font-medium">{job.type}</div>
                    <div className="text-sm text-muted-foreground">{job.upstreamJobId ?? "No upstream job ID yet"}</div>
                  </div>
                  <StatusChip status={job.status} />
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Businesses with CPC readiness issues</CardTitle>
            <CardDescription>Clear these before launching new CPC work.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {readinessIssues.length === 0 ? (
              <EmptyState title="All clear" description="Saved businesses currently meet the baseline readiness checks for CPC." />
            ) : (
              readinessIssues.slice(0, 6).map((business) => (
                <div className="rounded-lg border border-border p-4" key={business.id}>
                  <div className="flex items-center justify-between gap-4">
                    <Link className="font-medium hover:underline" href={`/businesses/${business.id}`}>
                      {business.name}
                    </Link>
                    <div className="flex items-center gap-2">
                      <Badge variant={eligibilityVariantMap[business.readiness.adsEligibilityStatus]}>
                        {eligibilityLabelMap[business.readiness.adsEligibilityStatus]}
                      </Badge>
                      <CircleOff className="h-4 w-4 text-warning" />
                    </div>
                  </div>
                  <div className="mt-2 text-sm text-muted-foreground">{business.readiness.missingItems[0] ?? "Readiness needs attention."}</div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Recent reporting queue</CardTitle>
          <CardDescription>Saved Yelp batches. Pending runs are delayed snapshots, not live reporting.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {reports.reports.length === 0 ? (
            <EmptyState title="No reports requested yet" description="Request a batch report when the team needs a saved Yelp snapshot." />
          ) : (
            reports.reports.slice(0, 5).map((report) => (
              <div className="flex items-center justify-between rounded-lg border border-border p-4" key={report.id}>
                <div>
                  <Link className="font-medium hover:underline" href={`/reporting/${report.id}`}>
                    {report.granularity} report
                  </Link>
                  <div className="text-xs text-muted-foreground">
                    Requested {formatDateTime(report.createdAt)}
                  </div>
                </div>
                <StatusChip status={report.status} />
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
