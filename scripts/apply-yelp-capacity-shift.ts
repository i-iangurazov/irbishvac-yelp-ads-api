import { getProgramCampaignLayer } from "../features/ads-programs/layers";
import {
  CAPACITY_SHIFT_APPROVAL_REFERENCE,
  CAPACITY_SHIFT_RESTORE_DATE,
} from "../features/ads-programs/temporary-capacity-shift";
import {
  pollProgramJobWorkflow,
  updateProgramBudgetWorkflow,
} from "../features/ads-programs/service";
import { toJsonValue } from "../lib/db/json";
import { prisma } from "../lib/db/prisma";
import { YelpAdsClient } from "../lib/yelp/ads-client";
import { ensureYelpAccess } from "../lib/yelp/runtime";
import type { YelpUpstreamProgramDto } from "../lib/yelp/schemas";

const TERMINAL_JOB_STATUSES = new Set(["COMPLETED", "FAILED", "PARTIAL"]);
const budgetTargets = [
  {
    label: "HVAC Installation",
    campaignLayer: "SEPTEMBER_HVAC_INSTALLATION",
    upstreamProgramId: "DLJGvx-T0QQt8IXx8xUCCA",
    temporaryDailyBudgetDollars: "525",
    temporaryBudgetCents: 1_575_000,
    restoreBudgetCents: 1_200_000,
  },
  {
    label: "HVAC Service / Repair",
    campaignLayer: "SEPTEMBER_HVAC_REPAIR",
    upstreamProgramId: "chZwdNae5UHK2asYXSiizg",
    temporaryDailyBudgetDollars: "525",
    temporaryBudgetCents: 1_575_000,
    restoreBudgetCents: 1_200_000,
  },
  {
    label: "Plumbing",
    campaignLayer: "SEPTEMBER_PLUMBING",
    upstreamProgramId: "ZKnDBk9eS2jJa7Xi3a3Cjg",
    temporaryDailyBudgetDollars: "250",
    temporaryBudgetCents: 750_000,
    restoreBudgetCents: 1_500_000,
  },
] as const;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function containsScalar(value: unknown, expected: string | number): boolean {
  if (value === expected) return true;
  if (Array.isArray(value)) {
    return value.some((entry) => containsScalar(entry, expected));
  }
  if (typeof value === "object" && value !== null) {
    return Object.values(value).some((entry) =>
      containsScalar(entry, expected),
    );
  }
  return false;
}

function hasScheduledRestore(changes: unknown[], restoreBudgetCents: number) {
  return (
    containsScalar(changes, CAPACITY_SHIFT_RESTORE_DATE) &&
    (containsScalar(changes, restoreBudgetCents) ||
      containsScalar(changes, restoreBudgetCents / 100))
  );
}

function getProgramFromInfo(
  programs: YelpUpstreamProgramDto[],
  upstreamProgramId: string,
) {
  const program = programs.find(
    (candidate) => candidate.program_id === upstreamProgramId,
  );

  if (!program) {
    throw new Error(`Yelp did not return program ${upstreamProgramId}.`);
  }

  return program;
}

async function readProgram(client: YelpAdsClient, upstreamProgramId: string) {
  return getProgramFromInfo(
    (await client.getProgramInfo(upstreamProgramId)).data.programs,
    upstreamProgramId,
  );
}

async function waitForTerminalJob(tenantId: string, jobId: string) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const job = await pollProgramJobWorkflow(tenantId, jobId);

    if (TERMINAL_JOB_STATUSES.has(job.status)) {
      if (job.status !== "COMPLETED") {
        throw new Error(
          `Yelp job ${job.upstreamJobId ?? job.id} ended as ${job.status}.`,
        );
      }
      return job;
    }

    await sleep(3_000);
  }

  throw new Error(`Yelp job ${jobId} did not reach a terminal state.`);
}

async function reconcilePendingJobs(tenantId: string, programId: string) {
  const pending = await prisma.programJob.findMany({
    where: {
      tenantId,
      programId,
      status: { in: ["QUEUED", "PROCESSING"] },
      upstreamJobId: { not: null },
    },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });

  for (const job of pending) {
    await waitForTerminalJob(tenantId, job.id);
  }
}

async function main() {
  const businessId = process.env.YELP_INVENTORY_BUSINESS_ID;
  const apply = process.env.YELP_CAPACITY_SHIFT_APPLY === "1";
  const requestedActorEmail =
    process.env.YELP_RECONCILE_ACTOR_EMAIL ?? process.env.SEED_ADMIN_EMAIL;

  if (!businessId) throw new Error("Set YELP_INVENTORY_BUSINESS_ID.");

  const business = await prisma.business.findUniqueOrThrow({
    where: { id: businessId },
    select: { tenantId: true },
  });
  const actors = await prisma.user.findMany({
    where: {
      tenantId: business.tenantId,
      isActive: true,
      ...(requestedActorEmail ? { email: requestedActorEmail } : {}),
    },
    select: { id: true, role: { select: { code: true } } },
  });
  const platformActors = actors.filter((actor) =>
    ["PLATFORM_ADMIN", "ADMIN"].includes(actor.role.code),
  );
  if (platformActors.length !== 1) {
    throw new Error(
      `Expected one active platform administrator; found ${platformActors.length}.`,
    );
  }
  const actorId = platformActors[0]!.id;
  const upstreamIds = budgetTargets.map((target) => target.upstreamProgramId);
  const localPrograms = await prisma.program.findMany({
    where: {
      tenantId: business.tenantId,
      businessId,
      upstreamProgramId: { in: upstreamIds },
    },
  });
  if (localPrograms.length !== upstreamIds.length) {
    throw new Error("The exact three approved local programs were not found.");
  }

  for (const target of budgetTargets) {
    const program = localPrograms.find(
      (candidate) => candidate.upstreamProgramId === target.upstreamProgramId,
    )!;
    if (
      getProgramCampaignLayer(program.configurationJson) !==
      target.campaignLayer
    ) {
      throw new Error(`${target.label} is not assigned to its approved layer.`);
    }
  }

  const { credential } = await ensureYelpAccess({
    tenantId: business.tenantId,
    capabilityKey: "adsApiEnabled",
    credentialKind: "ADS_BASIC_AUTH",
  });
  const client = new YelpAdsClient(credential);
  const upstreamPrograms = new Map<string, YelpUpstreamProgramDto>();

  for (const target of budgetTargets) {
    const upstream = await readProgram(client, target.upstreamProgramId);
    if (
      upstream.program_status !== "ACTIVE" ||
      upstream.program_pause_status !== "NOT_PAUSED"
    ) {
      throw new Error(`${target.label} is not active and unpaused in Yelp.`);
    }
    if (
      upstream.program_metrics?.budget !== target.restoreBudgetCents &&
      upstream.program_metrics?.budget !== target.temporaryBudgetCents
    ) {
      throw new Error(`${target.label} has an unexpected current budget.`);
    }
    if (
      upstream.future_budget_changes.length > 0 &&
      !hasScheduledRestore(
        upstream.future_budget_changes,
        target.restoreBudgetCents,
      )
    ) {
      throw new Error(
        `${target.label} has a conflicting future budget change.`,
      );
    }
    upstreamPrograms.set(target.upstreamProgramId, upstream);
  }

  const plan = {
    approvalReference: CAPACITY_SHIFT_APPROVAL_REFERENCE,
    restoreDate: CAPACITY_SHIFT_RESTORE_DATE,
    programs: budgetTargets.map((target) => ({
      label: target.label,
      upstreamProgramId: target.upstreamProgramId,
      currentBudgetCents:
        upstreamPrograms.get(target.upstreamProgramId)?.program_metrics
          ?.budget ?? null,
      targetDailyBudgetDollars: target.temporaryDailyBudgetDollars,
      targetMonthlyBudgetCents: target.temporaryBudgetCents,
      restoreMonthlyBudgetCents: target.restoreBudgetCents,
      scheduledRestoreExists: hasScheduledRestore(
        upstreamPrograms.get(target.upstreamProgramId)?.future_budget_changes ??
          [],
        target.restoreBudgetCents,
      ),
    })),
  };

  if (!apply) {
    console.log(JSON.stringify({ ok: true, dryRun: true, plan }, null, 2));
    return;
  }

  const changedPrograms = new Set<string>();

  try {
    for (const target of budgetTargets) {
      const localProgram = localPrograms.find(
        (candidate) => candidate.upstreamProgramId === target.upstreamProgramId,
      )!;
      await reconcilePendingJobs(business.tenantId, localProgram.id);
      let upstream = await readProgram(client, target.upstreamProgramId);

      if (upstream.program_metrics?.budget !== target.temporaryBudgetCents) {
        const result = await updateProgramBudgetWorkflow(
          business.tenantId,
          actorId,
          localProgram.id,
          {
            operation: "CURRENT_BUDGET",
            currentBudgetDollars: String(target.temporaryBudgetCents / 100),
            internalNote: `${CAPACITY_SHIFT_APPROVAL_REFERENCE}; temporary $${target.temporaryDailyBudgetDollars}/day allocation.`,
          },
          {
            approvedSeptemberOverride: {
              campaignLayer: target.campaignLayer,
              monthlyBudgetDollars: String(target.temporaryBudgetCents / 100),
              approvalReference: CAPACITY_SHIFT_APPROVAL_REFERENCE,
            },
          },
        );
        changedPrograms.add(target.upstreamProgramId);
        await waitForTerminalJob(business.tenantId, result.jobId);
      }

      upstream = await readProgram(client, target.upstreamProgramId);
      if (upstream.program_metrics?.budget !== target.temporaryBudgetCents) {
        throw new Error(`${target.label} budget failed Yelp read-back.`);
      }

      const finalReadBack = await readProgram(client, target.upstreamProgramId);
      if (
        finalReadBack.program_metrics?.budget !== target.temporaryBudgetCents
      ) {
        throw new Error(`${target.label} failed final Yelp verification.`);
      }

      const refreshedLocalProgram = await prisma.program.findUniqueOrThrow({
        where: { id: localProgram.id },
        select: { configurationJson: true },
      });
      const configuration = asRecord(refreshedLocalProgram.configurationJson);
      const previousOverride = asRecord(configuration.temporaryBudgetOverride);
      await prisma.program.update({
        where: { id: localProgram.id },
        data: {
          configurationJson: toJsonValue({
            ...configuration,
            temporaryBudgetOverride: {
              ...previousOverride,
              status: "SUPERSEDED_BY_CAPACITY_SHIFT",
              supersededAt: new Date().toISOString(),
            },
            temporaryCapacityShift: {
              approvalReference: CAPACITY_SHIFT_APPROVAL_REFERENCE,
              dailyBudgetDollars: target.temporaryDailyBudgetDollars,
              monthlyBudgetDollars: String(target.temporaryBudgetCents / 100),
              restoreDate: CAPACITY_SHIFT_RESTORE_DATE,
              restoreMonthlyBudgetDollars: String(
                target.restoreBudgetCents / 100,
              ),
              restoreMode: "INTERNAL_SCHEDULER",
              status: "INTERNAL_SCHEDULED",
            },
          }),
        },
      });
    }

    console.log(
      JSON.stringify(
        {
          ok: true,
          dryRun: false,
          verified: true,
          plan,
          final: {
            programs: budgetTargets.map((target) => ({
              label: target.label,
              monthlyBudgetCents: target.temporaryBudgetCents,
              dailyBudgetDollars: target.temporaryDailyBudgetDollars,
            })),
            restoreDate: CAPACITY_SHIFT_RESTORE_DATE,
          },
        },
        null,
        2,
      ),
    );
  } catch (error) {
    const rollbackErrors: string[] = [];

    for (const target of budgetTargets) {
      if (!changedPrograms.has(target.upstreamProgramId)) continue;
      const localProgram = localPrograms.find(
        (candidate) => candidate.upstreamProgramId === target.upstreamProgramId,
      )!;
      try {
        await reconcilePendingJobs(business.tenantId, localProgram.id);
        const result = await updateProgramBudgetWorkflow(
          business.tenantId,
          actorId,
          localProgram.id,
          {
            operation: "CURRENT_BUDGET",
            currentBudgetDollars: String(target.restoreBudgetCents / 100),
            internalNote: `${CAPACITY_SHIFT_APPROVAL_REFERENCE}; compensating rollback.`,
          },
          {
            approvedSeptemberOverride: {
              campaignLayer: target.campaignLayer,
              monthlyBudgetDollars: String(target.restoreBudgetCents / 100),
              approvalReference: CAPACITY_SHIFT_APPROVAL_REFERENCE,
            },
          },
        );
        await waitForTerminalJob(business.tenantId, result.jobId);
      } catch (rollbackError) {
        rollbackErrors.push(
          `${target.label}: ${rollbackError instanceof Error ? rollbackError.message : "unknown rollback failure"}`,
        );
      }
    }

    throw new Error(
      `${error instanceof Error ? error.message : "Capacity shift failed."}${
        rollbackErrors.length > 0
          ? ` Rollback failures: ${rollbackErrors.join("; ")}`
          : " Changes were rolled back."
      }`,
    );
  }
}

main()
  .catch((error) => {
    console.error(
      JSON.stringify({
        ok: false,
        error: error instanceof Error ? error.message : "Unknown failure",
      }),
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
