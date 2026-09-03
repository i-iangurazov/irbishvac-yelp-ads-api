import "server-only";

import { getProgramCampaignLayer } from "@/features/ads-programs/layers";
import { updateProgramBudgetWorkflow } from "@/features/ads-programs/service";
import { getPacificDateKey } from "@/features/ads-programs/spend-snapshots";
import { prisma } from "@/lib/db/prisma";
import { toJsonValue } from "@/lib/db/json";

const APPROVAL_REFERENCE = "Emil temporary budget request, 2026-09-03";

const restoreTargets = [
  {
    label: "HVAC Installation",
    campaignLayer: "SEPTEMBER_HVAC_INSTALLATION",
    upstreamProgramId: "DLJGvx-T0QQt8IXx8xUCCA",
    temporaryBudgetCents: 1_650_000,
    restoreBudgetCents: 1_200_000,
    restoreDate: "2026-09-07",
  },
  {
    label: "HVAC Service / Repair",
    campaignLayer: "SEPTEMBER_HVAC_REPAIR",
    upstreamProgramId: "chZwdNae5UHK2asYXSiizg",
    temporaryBudgetCents: 1_650_000,
    restoreBudgetCents: 1_200_000,
    restoreDate: "2026-09-07",
  },
] as const;

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

async function updateRestoreStatus(
  program: {
    id: string;
    configurationJson: unknown;
  },
  status: string,
) {
  const configuration = asRecord(program.configurationJson);
  const temporaryBudgetOverride = asRecord(
    configuration.temporaryBudgetOverride,
  );

  await prisma.program.update({
    where: { id: program.id },
    data: {
      configurationJson: toJsonValue({
        ...configuration,
        temporaryBudgetOverride: {
          ...temporaryBudgetOverride,
          status,
          lastCheckedAt: new Date().toISOString(),
        },
      }),
    },
  });
}

export async function reconcileDueTemporaryBudgetRestores(now = new Date()) {
  const dateKey = getPacificDateKey(now);
  const programs = await prisma.program.findMany({
    where: {
      upstreamProgramId: {
        in: restoreTargets.map((target) => target.upstreamProgramId),
      },
    },
    include: {
      jobs: {
        where: { status: { in: ["QUEUED", "PROCESSING"] } },
        take: 1,
      },
    },
  });
  const results = [];

  for (const target of restoreTargets) {
    const program = programs.find(
      (candidate) => candidate.upstreamProgramId === target.upstreamProgramId,
    );

    if (!program) {
      results.push({
        upstreamProgramId: target.upstreamProgramId,
        label: target.label,
        status: "BLOCKED",
        reason: "Program not found.",
      });
      continue;
    }

    const override = asRecord(
      asRecord(program.configurationJson).temporaryBudgetOverride,
    );
    const isApprovedOverride =
      getProgramCampaignLayer(program.configurationJson) ===
        target.campaignLayer &&
      override.approvalReference === APPROVAL_REFERENCE &&
      override.restoreMode === "INTERNAL_SCHEDULER" &&
      override.restoreDate === target.restoreDate &&
      override.monthlyBudgetDollars ===
        String(target.temporaryBudgetCents / 100) &&
      override.restoreMonthlyBudgetDollars ===
        String(target.restoreBudgetCents / 100);

    if (!isApprovedOverride) {
      results.push({
        upstreamProgramId: target.upstreamProgramId,
        label: target.label,
        status: "BLOCKED",
        reason: "The exact approved temporary override metadata is missing.",
      });
      continue;
    }

    if (dateKey < target.restoreDate) {
      results.push({
        upstreamProgramId: target.upstreamProgramId,
        label: target.label,
        status: "NOT_DUE",
        restoreDate: target.restoreDate,
      });
      continue;
    }

    if (program.budgetCents === target.restoreBudgetCents) {
      await updateRestoreStatus(program, "COMPLETED");
      results.push({
        upstreamProgramId: target.upstreamProgramId,
        label: target.label,
        status: "COMPLETED",
        restoreBudgetCents: target.restoreBudgetCents,
      });
      continue;
    }

    if (program.budgetCents !== target.temporaryBudgetCents) {
      await updateRestoreStatus(program, "BLOCKED");
      results.push({
        upstreamProgramId: target.upstreamProgramId,
        label: target.label,
        status: "BLOCKED",
        reason:
          "Current budget no longer matches the approved temporary value.",
      });
      continue;
    }

    if (program.jobs.length > 0) {
      results.push({
        upstreamProgramId: target.upstreamProgramId,
        label: target.label,
        status: "PENDING",
      });
      continue;
    }

    const actor = await prisma.user.findFirst({
      where: {
        tenantId: program.tenantId,
        isActive: true,
        role: { code: { in: ["PLATFORM_ADMIN", "ADMIN"] } },
      },
      select: { id: true },
      orderBy: { createdAt: "asc" },
    });

    if (!actor) {
      results.push({
        upstreamProgramId: target.upstreamProgramId,
        label: target.label,
        status: "BLOCKED",
        reason: "No active administrator is available for audit attribution.",
      });
      continue;
    }

    try {
      const submitted = await updateProgramBudgetWorkflow(
        program.tenantId,
        actor.id,
        program.id,
        {
          operation: "CURRENT_BUDGET",
          currentBudgetDollars: String(target.restoreBudgetCents / 100),
          internalNote: `${APPROVAL_REFERENCE}; automatic restoration after the weekend.`,
        },
        {
          approvedSeptemberOverride: {
            campaignLayer: target.campaignLayer,
            monthlyBudgetDollars: String(target.restoreBudgetCents / 100),
            approvalReference: APPROVAL_REFERENCE,
          },
        },
      );
      await updateRestoreStatus(program, "SUBMITTED");
      results.push({
        upstreamProgramId: target.upstreamProgramId,
        label: target.label,
        status: "SUBMITTED",
        jobId: submitted.jobId,
        restoreBudgetCents: target.restoreBudgetCents,
      });
    } catch (error) {
      results.push({
        upstreamProgramId: target.upstreamProgramId,
        label: target.label,
        status: "FAILED",
        reason:
          error instanceof Error ? error.message : "Unknown restore failure",
      });
    }
  }

  return results;
}
