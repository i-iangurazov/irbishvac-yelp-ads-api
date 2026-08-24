import Link from "next/link";
import type { Route } from "next";
import {
  ArrowRight,
  CheckCircle2,
  Circle,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";

import { OnboardingBusinessActions } from "@/components/forms/onboarding-business-actions";
import { OnboardingTenantCreateForm } from "@/components/forms/onboarding-tenant-create-form";
import { PageHeader } from "@/components/shared/page-header";
import { StatusChip } from "@/components/shared/status-chip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getTenantOnboardingOverview } from "@/features/onboarding/service";
import { requirePermission } from "@/lib/auth/service";
import { hasPermission } from "@/lib/permissions";
import { cn } from "@/lib/utils/cn";

export default async function OnboardingPage() {
  const user = await requirePermission("onboarding:read");
  const overview = await getTenantOnboardingOverview(user.tenantId);
  const canManage = hasPermission(user.role.code, "onboarding:manage");
  const canCreateTenant = hasPermission(user.role.code, "tenants:manage");

  return (
    <div>
      <PageHeader
        title="Client onboarding"
        description="Connect each client safely, verify every production dependency, and activate only after all release checks pass."
        actions={
          <div className="flex items-center gap-2">
            <Badge variant="outline">{overview.tenant.name}</Badge>
            <Badge variant={canManage ? "secondary" : "outline"}>
              {canManage ? "Operator controls" : "Read only"}
            </Badge>
          </div>
        }
      />

      <div className="mb-6 grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Businesses", overview.summary.total],
          ["Ready", overview.summary.ready],
          ["Active", overview.summary.active],
          ["Blocked", overview.summary.blocked],
        ].map(([label, value]) => (
          <div className="bg-background p-4" key={label}>
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {label}
            </div>
            <div className="mt-1 text-2xl font-semibold tabular-nums">
              {value}
            </div>
          </div>
        ))}
      </div>

      {canCreateTenant ? (
        <Card className="mb-6 border-primary/30">
          <CardHeader>
            <CardTitle>Create an external client workspace</CardTitle>
            <CardDescription>
              Creates an isolated tenant, a Client administrator, and safe
              defaults with automation paused in review-only mode. You will be
              switched into the new workspace to finish setup.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <OnboardingTenantCreateForm />
          </CardContent>
        </Card>
      ) : null}

      {overview.businessStates.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <ShieldCheck
            className="mx-auto h-8 w-8 text-muted-foreground"
            aria-hidden="true"
          />
          <h2 className="mt-3 text-lg font-semibold">Add the first business</h2>
          <p className="mx-auto mt-1 max-w-xl text-sm text-muted-foreground">
            A workspace cannot be activated until a Yelp business is mapped and
            its connections, review policy, limits, fallback, and worker health
            all pass.
          </p>
          {hasPermission(user.role.code, "businesses:write") ? (
            <Button asChild className="mt-4">
              <Link href="/businesses">
                Open businesses
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </Button>
          ) : null}
        </div>
      ) : (
        <div className="grid gap-6">
          {overview.businessStates.map((business) => (
            <Card key={business.id}>
              <CardHeader className="gap-4 md:flex-row md:items-start md:justify-between">
                <div>
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <StatusChip status={business.status} />
                    <Badge variant="outline">
                      {[business.city, business.state]
                        .filter(Boolean)
                        .join(", ") || "Location pending"}
                    </Badge>
                  </div>
                  <CardTitle>{business.name}</CardTitle>
                  <CardDescription>
                    {business.canActivate
                      ? "All required checks pass. Activation will remain review-only."
                      : `${business.failedChecks.length} required checks still block activation.`}
                  </CardDescription>
                </div>
                {canManage ? (
                  <OnboardingBusinessActions
                    businessId={business.id}
                    status={business.status}
                    canActivate={business.canActivate}
                    emergencyDisabled={business.emergencyDisabled}
                  />
                ) : null}
              </CardHeader>
              <CardContent>
                <div className="divide-y divide-border/70 border-y border-border/70">
                  {business.checks.map((check) => {
                    const Icon = check.passed
                      ? CheckCircle2
                      : check.id === "safety" || check.id === "worker"
                        ? TriangleAlert
                        : Circle;

                    return (
                      <div
                        className="grid gap-3 py-3 sm:grid-cols-[24px_1fr_auto] sm:items-center"
                        key={check.id}
                      >
                        <Icon
                          className={cn(
                            "h-5 w-5",
                            check.passed
                              ? "text-emerald-600"
                              : "text-amber-600",
                          )}
                          aria-hidden="true"
                        />
                        <div>
                          <div className="text-sm font-medium">
                            {check.label}
                          </div>
                          <p className="text-xs leading-5 text-muted-foreground">
                            {check.detail}
                          </p>
                        </div>
                        <Button asChild variant="ghost" size="sm">
                          <Link href={check.href as Route}>
                            {check.passed ? "Review" : "Resolve"}
                            <ArrowRight
                              className="h-4 w-4"
                              aria-hidden="true"
                            />
                          </Link>
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
