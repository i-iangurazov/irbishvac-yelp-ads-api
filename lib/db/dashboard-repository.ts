import "server-only";

import type { ProgramStatus } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";

const currentProgramStatuses: ProgramStatus[] = [
  "ACTIVE",
  "SCHEDULED",
  "QUEUED",
  "PROCESSING",
  "PARTIAL",
];

export async function getDashboardSnapshot(tenantId: string, now = new Date()) {
  const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const [
    businesses,
    currentPrograms,
    failedJobs,
    unmappedLeads,
    pendingReports,
    recentReports,
    failedWebhooksLast24h,
    failedReconcilesLast24h,
  ] = await Promise.all([
    prisma.business.findMany({
      where: { tenantId },
      select: {
        id: true,
        name: true,
        categoriesJson: true,
        readinessJson: true,
      },
      orderBy: [{ updatedAt: "desc" }, { name: "asc" }],
    }),
    prisma.program.findMany({
      where: { tenantId, status: { in: currentProgramStatuses } },
      select: {
        id: true,
        upstreamProgramId: true,
        status: true,
        updatedAt: true,
        business: {
          select: {
            name: true,
            readinessJson: true,
          },
        },
      },
    }),
    prisma.programJob.findMany({
      where: {
        tenantId,
        status: { in: ["FAILED", "PARTIAL"] },
        program: { status: { in: currentProgramStatuses } },
      },
      select: {
        id: true,
        type: true,
        status: true,
        upstreamJobId: true,
        createdAt: true,
        business: {
          select: {
            name: true,
            readinessJson: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    prisma.yelpLead.count({
      where: { tenantId, internalStatus: "UNMAPPED" },
    }),
    prisma.reportRequest.count({
      where: { tenantId, status: { in: ["REQUESTED", "PROCESSING"] } },
    }),
    prisma.reportRequest.findMany({
      where: { tenantId },
      select: {
        id: true,
        granularity: true,
        status: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
    prisma.yelpWebhookEvent.count({
      where: {
        tenantId,
        status: { in: ["PARTIAL", "FAILED"] },
        receivedAt: { gte: last24h },
      },
    }),
    prisma.syncRun.count({
      where: {
        tenantId,
        type: { in: ["YELP_LEADS_WEBHOOK", "YELP_LEADS_BACKFILL"] },
        status: { in: ["PARTIAL", "FAILED"] },
        startedAt: { gte: last24h },
      },
    }),
  ]);

  return {
    businesses,
    currentPrograms,
    failedJobs,
    unmappedLeads,
    pendingReports,
    recentReports,
    failedWebhooksLast24h,
    failedReconcilesLast24h,
  };
}
