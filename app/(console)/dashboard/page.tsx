import Link from "next/link";
import { AlertTriangle, BarChart3, CircleOff, Clock4, SearchCheck } from "lucide-react";

import { MetricCard } from "@/components/shared/metric-card";
import { PageHeader } from "@/components/shared/page-header";
import { StatusChip } from "@/components/shared/status-chip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import { getBusinessesIndex } from "@/features/businesses/service";
import { getProgramsIndex } from "@/features/ads-programs/service";
import { getReportingIndex } from "@/features/reporting/service";
import { getSettingsOverview } from "@/features/settings/service";
import { getCredentialHealthViewModel, getEnabledCapabilityLabels } from "@/features/settings/view-models";
import { requireUser } from "@/lib/auth/service";

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
  const [businesses, programs, reports, settings] = await Promise.all([
    getBusinessesIndex(user.tenantId),
    getProgramsIndex(user.tenantId),
    getReportingIndex(user.tenantId),
    getSettingsOverview(user.tenantId)
  ]);

  const failedJobs = programs.flatMap((program) => program.jobs).filter((job) => job.status === "FAILED" || job.status === "PARTIAL");
  const readinessIssues = businesses.filter((business) => !business.readiness.isReadyForCpc);
  const enabledApis = getEnabledCapabilityLabels(settings.capabilities);

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Monitor connection health, Yelp capability enablement, pending jobs, recent reports, and businesses that are not yet ready for CPC."
        actions={
          <div className="flex gap-3">
            <Button asChild>
              <Link href="/ads">Open Ads workspace</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/leads">Review leads</Link>
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="Businesses" value={businesses.length} description="Saved businesses available to operations" icon={<SearchCheck className="h-5 w-5 text-muted-foreground" />} />
        <MetricCard title="Programs" value={programs.length} description="Active, scheduled, or pending Yelp programs" icon={<BarChart3 className="h-5 w-5 text-muted-foreground" />} />
        <MetricCard title="Reports" value={reports.length} description="Cached report requests and results" icon={<Clock4 className="h-5 w-5 text-muted-foreground" />} />
        <MetricCard title="Attention needed" value={failedJobs.length} description="Failed or partially completed jobs" icon={<AlertTriangle className="h-5 w-5 text-warning" />} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <Card>
          <CardHeader>
            <CardTitle>Connection health</CardTitle>
            <CardDescription>Saved credentials, request enablement, and the last verification result for each integration.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {settings.credentials.length === 0 ? (
              <EmptyState title="No credentials saved yet" description="Go to Settings to save Yelp credentials before using the live integrations." />
            ) : (
              settings.credentials.map((credential) => {
                const health = getCredentialHealthViewModel(credential);

                return (
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
                );
              })
            )}
            <div className="rounded-lg border border-border bg-muted/40 p-4">
              <div className="font-medium">APIs enabled</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {enabledApis.length > 0 ? enabledApis.map((label) => <Badge key={label}>{label}</Badge>) : <Badge variant="outline">None enabled yet</Badge>}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Quick actions</CardTitle>
            <CardDescription>Most common workflows for operations and account teams.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <Button asChild className="justify-start">
              <Link href="/ads">Open Ads workspace</Link>
            </Button>
            <Button asChild className="justify-start" variant="outline">
              <Link href="/programs/new">Create a new ad program</Link>
            </Button>
            <Button asChild className="justify-start" variant="outline">
              <Link href="/reporting">Request daily or monthly report</Link>
            </Button>
            <Button asChild className="justify-start" variant="outline">
              <Link href="/integrations">Check integrations and sync health</Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Failed jobs needing attention</CardTitle>
            <CardDescription>Async requests that finished with errors or partial completion.</CardDescription>
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
            <CardDescription>Ops users can use these signals before submitting CPC programs.</CardDescription>
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
                  <div className="mt-2 text-sm text-muted-foreground">{business.readiness.missingItems.join("; ")}</div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
