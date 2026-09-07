import "server-only";

import { getProgramCampaignLayer } from "@/features/ads-programs/layers";
import { updateProgramBudgetWorkflow } from "@/features/ads-programs/service";
import { getPacificDateKey } from "@/features/ads-programs/spend-snapshots";
import { toJsonValue } from "@/lib/db/json";
import { prisma } from "@/lib/db/prisma";
import { YelpAdsClient } from "@/lib/yelp/ads-client";
import { ensureYelpAccess } from "@/lib/yelp/runtime";
import type { YelpUpstreamProgramDto } from "@/lib/yelp/schemas";

export const CAPACITY_SHIFT_APPROVAL_REFERENCE =
  "Emil no-work capacity shift, 2026-09-07";
export const CAPACITY_SHIFT_RESTORE_DATE = "2026-09-10";

const targets = [
  {
    kind: "BUDGET" as const,
    label: "HVAC Installation",
    campaignLayer: "SEPTEMBER_HVAC_INSTALLATION",
    upstreamProgramId: "DLJGvx-T0QQt8IXx8xUCCA",
    temporaryBudgetCents: 1_950_000,
    restoreBudgetCents: 1_200_000,
  },
  {
    kind: "BUDGET" as const,
    label: "HVAC Service / Repair",
    campaignLayer: "SEPTEMBER_HVAC_REPAIR",
    upstreamProgramId: "chZwdNae5UHK2asYXSiizg",
    temporaryBudgetCents: 1_950_000,
    restoreBudgetCents: 1_200_000,
  },
  {
    kind: "RESUME" as const,
    label: "Plumbing",
    campaignLayer: "SEPTEMBER_PLUMBING",
    upstreamProgramId: "ZKnDBk9eS2jJa7Xi3a3Cjg",
  },
] as const;

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function hasApprovedShift(program: {
  configurationJson: unknown;
  upstreamProgramId: string | null;
}) {
  const target = targets.find(
    (candidate) => candidate.upstreamProgramId === program.upstreamProgramId,
  );
  const override = asRecord(
    asRecord(program.configurationJson).temporaryCapacityShift,
  );

  if (
    !target ||
    getProgramCampaignLayer(program.configurationJson) !==
      target.campaignLayer ||
    override.approvalReference !== CAPACITY_SHIFT_APPROVAL_REFERENCE ||
    override.restoreDate !== CAPACITY_SHIFT_RESTORE_DATE
  ) {
    return false;
  }

  if (target.kind === "RESUME") {
    return override.restoreMode === "INTERNAL_RESUME";
  }

  return (
    override.dailyBudgetDollars === "650" &&
    override.monthlyBudgetDollars ===
      String(target.temporaryBudgetCents / 100) &&
    override.restoreMonthlyBudgetDollars ===
      String(target.restoreBudgetCents / 100) &&
    override.restoreMode === "YELP_SCHEDULED_WITH_INTERNAL_FALLBACK"
  );
}

async function updateShiftStatus(
  program: { id: string; configurationJson: unknown },
  status: string,
) {
  const latest = await prisma.program.findUniqueOrThrow({
    where: { id: program.id },
    select: { configurationJson: true },
  });
  const configuration = asRecord(latest.configurationJson);
  const override = asRecord(configuration.temporaryCapacityShift);

  await prisma.program.update({
    where: { id: program.id },
    data: {
      configurationJson: toJsonValue({
        ...configuration,
        temporaryCapacityShift: {
          ...override,
          status,
          lastCheckedAt: new Date().toISOString(),
        },
      }),
    },
  });
}

async function findAuditActor(tenantId: string) {
  return prisma.user.findFirst({
    where: {
      tenantId,
      isActive: true,
      role: { code: { in: ["PLATFORM_ADMIN", "ADMIN"] } },
    },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
}

async function getUpstreamProgram(
  client: YelpAdsClient,
  upstreamProgramId: string,
) {
  const response = await client.getProgramInfo(upstreamProgramId);
  const program = response.data.programs.find(
    (candidate: YelpUpstreamProgramDto) =>
      candidate.program_id === upstreamProgramId,
  );

  if (!program) {
    throw new Error(`Yelp did not return ${upstreamProgramId}.`);
  }

  return program;
}

export async function reconcileDueTemporaryCapacityShiftRestores(
  now = new Date(),
) {
  const dateKey = getPacificDateKey(now);
  const programs = await prisma.program.findMany({
    where: {
      upstreamProgramId: {
        in: targets.map((target) => target.upstreamProgramId),
      },
    },
    include: {
      jobs: {
        where: { status: { in: ["QUEUED", "PROCESSING"] } },
        take: 1,
      },
    },
  });
  const clients = new Map<string, YelpAdsClient>();
  const results = [];

  for (const target of targets) {
    const program = programs.find(
      (candidate) => candidate.upstreamProgramId === target.upstreamProgramId,
    );

    if (!program) {
      results.push({
        label: target.label,
        status: "BLOCKED",
        reason: "Program not found.",
      });
      continue;
    }

    const shiftMetadata = asRecord(
      asRecord(program.configurationJson).temporaryCapacityShift,
    );
    if (Object.keys(shiftMetadata).length === 0) {
      results.push({ label: target.label, status: "SKIPPED" });
      continue;
    }

    if (!hasApprovedShift(program)) {
      results.push({
        label: target.label,
        status: "BLOCKED",
        reason: "The exact approved capacity-shift metadata is missing.",
      });
      continue;
    }

    if (dateKey < CAPACITY_SHIFT_RESTORE_DATE) {
      results.push({
        label: target.label,
        status: "NOT_DUE",
        restoreDate: CAPACITY_SHIFT_RESTORE_DATE,
      });
      continue;
    }

    let client = clients.get(program.tenantId);
    if (!client) {
      const { credential } = await ensureYelpAccess({
        tenantId: program.tenantId,
        capabilityKey: "adsApiEnabled",
        credentialKind: "ADS_BASIC_AUTH",
      });
      client = new YelpAdsClient(credential);
      clients.set(program.tenantId, client);
    }

    try {
      const upstream = await getUpstreamProgram(
        client,
        target.upstreamProgramId,
      );

      if (target.kind === "RESUME") {
        if (upstream.program_pause_status !== "PAUSED") {
          await updateShiftStatus(program, "COMPLETED");
          results.push({ label: target.label, status: "COMPLETED" });
          continue;
        }

        const actor = await findAuditActor(program.tenantId);
        if (!actor) {
          results.push({
            label: target.label,
            status: "BLOCKED",
            reason:
              "No active administrator is available for audit attribution.",
          });
          continue;
        }

        await client.resumeProgram(target.upstreamProgramId);
        await updateShiftStatus(program, "RESUME_SUBMITTED");
        await prisma.auditEvent.create({
          data: {
            tenantId: program.tenantId,
            actorId: actor.id,
            businessId: program.businessId,
            programId: program.id,
            actionType: "program.capacity-shift.resume",
            status: "SUCCESS",
            requestSummaryJson: toJsonValue({
              approvalReference: CAPACITY_SHIFT_APPROVAL_REFERENCE,
              restoreDate: CAPACITY_SHIFT_RESTORE_DATE,
            }),
          },
        });
        results.push({ label: target.label, status: "RESUME_SUBMITTED" });
        continue;
      }

      if (upstream.program_metrics?.budget === target.restoreBudgetCents) {
        await prisma.program.update({
          where: { id: program.id },
          data: { budgetCents: target.restoreBudgetCents },
        });
        await updateShiftStatus(program, "COMPLETED");
        results.push({ label: target.label, status: "COMPLETED" });
        continue;
      }

      if (upstream.program_metrics?.budget !== target.temporaryBudgetCents) {
        await updateShiftStatus(program, "BLOCKED");
        results.push({
          label: target.label,
          status: "BLOCKED",
          reason:
            "Current Yelp budget is neither the approved temporary nor restore value.",
        });
        continue;
      }

      if (program.jobs.length > 0) {
        results.push({ label: target.label, status: "PENDING" });
        continue;
      }

      const actor = await findAuditActor(program.tenantId);

      if (!actor) {
        results.push({
          label: target.label,
          status: "BLOCKED",
          reason: "No active administrator is available for audit attribution.",
        });
        continue;
      }

      const submitted = await updateProgramBudgetWorkflow(
        program.tenantId,
        actor.id,
        program.id,
        {
          operation: "CURRENT_BUDGET",
          currentBudgetDollars: String(target.restoreBudgetCents / 100),
          internalNote: `${CAPACITY_SHIFT_APPROVAL_REFERENCE}; automatic Thursday restoration.`,
        },
        {
          approvedSeptemberOverride: {
            campaignLayer: target.campaignLayer,
            monthlyBudgetDollars: String(target.restoreBudgetCents / 100),
            approvalReference: CAPACITY_SHIFT_APPROVAL_REFERENCE,
          },
        },
      );
      await updateShiftStatus(program, "RESTORE_SUBMITTED");
      results.push({
        label: target.label,
        status: "RESTORE_SUBMITTED",
        jobId: submitted.jobId,
      });
    } catch (error) {
      await updateShiftStatus(program, "FAILED");
      results.push({
        label: target.label,
        status: "FAILED",
        reason:
          error instanceof Error ? error.message : "Unknown restore failure",
      });
    }
  }

  return results;
}
