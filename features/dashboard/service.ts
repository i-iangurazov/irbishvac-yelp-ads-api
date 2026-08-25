import "server-only";

import { isBusinessEligibleForProgramInventory } from "@/features/ads-programs/status";
import { buildCpcReadiness } from "@/features/businesses/service";
import { getDashboardSettingsOverview } from "@/features/settings/service";
import { getDashboardSnapshot } from "@/lib/db/dashboard-repository";

export async function getDashboardOverview(tenantId: string) {
  const [snapshot, settings] = await Promise.all([
    getDashboardSnapshot(tenantId),
    getDashboardSettingsOverview(tenantId),
  ]);
  const uniquePrograms = new Map<
    string,
    (typeof snapshot.currentPrograms)[number]
  >();

  for (const program of snapshot.currentPrograms) {
    if (!isBusinessEligibleForProgramInventory(program.business)) {
      continue;
    }

    const key = program.upstreamProgramId
      ? `yelp:${program.upstreamProgramId}`
      : `local:${program.id}`;
    const existing = uniquePrograms.get(key);

    if (!existing || program.updatedAt > existing.updatedAt) {
      uniquePrograms.set(key, program);
    }
  }

  return {
    businesses: snapshot.businesses.map((business) => ({
      id: business.id,
      name: business.name,
      readiness: buildCpcReadiness(
        business.readinessJson,
        business.categoriesJson,
      ),
    })),
    activeProgramCount: [...uniquePrograms.values()].filter((program) =>
      ["ACTIVE", "SCHEDULED", "QUEUED", "PROCESSING"].includes(program.status),
    ).length,
    failedJobs: snapshot.failedJobs
      .filter((job) => isBusinessEligibleForProgramInventory(job.business))
      .slice(0, 6),
    unmappedLeads: snapshot.unmappedLeads,
    pendingReports: snapshot.pendingReports,
    recentReports: snapshot.recentReports,
    recentWebhookFailures:
      snapshot.failedWebhooksLast24h + snapshot.failedReconcilesLast24h,
    settings,
  };
}
