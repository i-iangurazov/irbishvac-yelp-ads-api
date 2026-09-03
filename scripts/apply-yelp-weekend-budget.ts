import { getProgramCampaignLayer } from "../features/ads-programs/layers";
import {
  pollProgramJobWorkflow,
  updateProgramBudgetWorkflow,
} from "../features/ads-programs/service";
import { toJsonValue } from "../lib/db/json";
import { prisma } from "../lib/db/prisma";
import { YelpAdsClient } from "../lib/yelp/ads-client";
import { dailyBudgetDollarsToMonthlyBudgetCents } from "../lib/yelp/budget";
import { ensureYelpAccess } from "../lib/yelp/runtime";
import type { YelpUpstreamProgramDto } from "../lib/yelp/schemas";

const RESTORE_DATE = "2026-09-07";
const APPROVAL_REFERENCE = "Emil temporary budget request, 2026-09-03";
const TERMINAL_JOB_STATUSES = new Set(["COMPLETED", "FAILED", "PARTIAL"]);

const adjustments = [
  {
    label: "Plumbing",
    campaignLayer: "SEPTEMBER_PLUMBING",
    upstreamProgramId: "ZKnDBk9eS2jJa7Xi3a3Cjg",
    dailyBudgetDollars: "230",
    restoreMonthlyBudgetDollars: "15000",
    restoreMode: "YELP_SCHEDULED",
  },
  {
    label: "HVAC Installation",
    campaignLayer: "SEPTEMBER_HVAC_INSTALLATION",
    upstreamProgramId: "DLJGvx-T0QQt8IXx8xUCCA",
    dailyBudgetDollars: "550",
    restoreMonthlyBudgetDollars: "12000",
    restoreMode: "INTERNAL_SCHEDULER",
  },
  {
    label: "HVAC Service / Repair",
    campaignLayer: "SEPTEMBER_HVAC_REPAIR",
    upstreamProgramId: "chZwdNae5UHK2asYXSiizg",
    dailyBudgetDollars: "550",
    restoreMonthlyBudgetDollars: "12000",
    restoreMode: "INTERNAL_SCHEDULER",
  },
] as const;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

function hasScheduledRestore(
  changes: unknown[],
  restoreDate: string,
  restoreBudgetCents: number,
) {
  return (
    containsScalar(changes, restoreDate) &&
    (containsScalar(changes, restoreBudgetCents) ||
      containsScalar(changes, restoreBudgetCents / 100))
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
  const apply = process.env.YELP_WEEKEND_BUDGET_APPLY === "1";
  const requestedActorEmail =
    process.env.YELP_RECONCILE_ACTOR_EMAIL ?? process.env.SEED_ADMIN_EMAIL;

  if (!businessId) {
    throw new Error("Set YELP_INVENTORY_BUSINESS_ID.");
  }

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
  const localPrograms = await prisma.program.findMany({
    where: {
      tenantId: business.tenantId,
      businessId,
      upstreamProgramId: {
        in: adjustments.map((adjustment) => adjustment.upstreamProgramId),
      },
    },
  });
  const { credential } = await ensureYelpAccess({
    tenantId: business.tenantId,
    capabilityKey: "adsApiEnabled",
    credentialKind: "ADS_BASIC_AUTH",
  });
  const client = new YelpAdsClient(credential);
  const plan = [];

  for (const adjustment of adjustments) {
    const localProgram = localPrograms.find(
      (program) => program.upstreamProgramId === adjustment.upstreamProgramId,
    );

    if (!localProgram) {
      throw new Error(
        `Local program ${adjustment.upstreamProgramId} was not found.`,
      );
    }
    if (
      getProgramCampaignLayer(localProgram.configurationJson) !==
      adjustment.campaignLayer
    ) {
      throw new Error(
        `${adjustment.label} is not assigned to ${adjustment.campaignLayer}.`,
      );
    }

    const targetBudgetCents = dailyBudgetDollarsToMonthlyBudgetCents(
      adjustment.dailyBudgetDollars,
    );
    const restoreBudgetCents =
      Number(adjustment.restoreMonthlyBudgetDollars) * 100;
    const initialInfo = await client.getProgramInfo(
      adjustment.upstreamProgramId,
    );
    const upstream = getProgramFromInfo(
      initialInfo.data.programs,
      adjustment.upstreamProgramId,
    );
    if (upstream.program_status !== "ACTIVE") {
      throw new Error(
        `${adjustment.label} is ${upstream.program_status} in Yelp, not ACTIVE.`,
      );
    }
    if (apply) {
      await prisma.program.update({
        where: { id: localProgram.id },
        data: {
          status: "ACTIVE",
          budgetCents:
            upstream.program_metrics?.budget ?? localProgram.budgetCents,
        },
      });
    }
    const scheduledRestoreExists = hasScheduledRestore(
      upstream.future_budget_changes,
      RESTORE_DATE,
      restoreBudgetCents,
    );

    if (
      adjustment.restoreMode === "YELP_SCHEDULED" &&
      upstream.future_budget_changes.length > 0 &&
      !scheduledRestoreExists
    ) {
      throw new Error(
        `${adjustment.label} has a conflicting future budget change.`,
      );
    }

    plan.push({
      label: adjustment.label,
      upstreamProgramId: adjustment.upstreamProgramId,
      currentBudgetCents: upstream.program_metrics?.budget ?? null,
      targetDailyBudgetDollars: adjustment.dailyBudgetDollars,
      targetMonthlyBudgetCents: targetBudgetCents,
      restoreDate: RESTORE_DATE,
      restoreMonthlyBudgetCents: restoreBudgetCents,
      restoreMode: adjustment.restoreMode,
      scheduledRestoreExists,
    });

    if (!apply) continue;

    await reconcilePendingJobs(business.tenantId, localProgram.id);

    if (upstream.program_metrics?.budget !== targetBudgetCents) {
      const currentResult = await updateProgramBudgetWorkflow(
        business.tenantId,
        actorId,
        localProgram.id,
        {
          operation: "CURRENT_BUDGET",
          currentBudgetDollars: String(targetBudgetCents / 100),
          internalNote: `${APPROVAL_REFERENCE}; ${adjustment.dailyBudgetDollars}/day through 2026-09-06.`,
        },
        {
          approvedSeptemberOverride: {
            campaignLayer: adjustment.campaignLayer,
            monthlyBudgetDollars: String(targetBudgetCents / 100),
            approvalReference: APPROVAL_REFERENCE,
          },
        },
      );
      await waitForTerminalJob(business.tenantId, currentResult.jobId);
    }

    const currentReadBack = getProgramFromInfo(
      (await client.getProgramInfo(adjustment.upstreamProgramId)).data.programs,
      adjustment.upstreamProgramId,
    );
    if (currentReadBack.program_metrics?.budget !== targetBudgetCents) {
      throw new Error(
        `${adjustment.label} current budget did not match Yelp readback.`,
      );
    }

    if (
      adjustment.restoreMode === "YELP_SCHEDULED" &&
      !hasScheduledRestore(
        currentReadBack.future_budget_changes,
        RESTORE_DATE,
        restoreBudgetCents,
      )
    ) {
      if (currentReadBack.future_budget_changes.length > 0) {
        throw new Error(
          `${adjustment.label} has a conflicting future budget change after the current update.`,
        );
      }
      const restoreResult = await updateProgramBudgetWorkflow(
        business.tenantId,
        actorId,
        localProgram.id,
        {
          operation: "SCHEDULED_BUDGET",
          scheduledBudgetDollars: adjustment.restoreMonthlyBudgetDollars,
          scheduledBudgetEffectiveDate: RESTORE_DATE,
          internalNote: `${APPROVAL_REFERENCE}; automatic restoration after the weekend.`,
        },
        {
          approvedSeptemberOverride: {
            campaignLayer: adjustment.campaignLayer,
            monthlyBudgetDollars: adjustment.restoreMonthlyBudgetDollars,
            effectiveDate: RESTORE_DATE,
            approvalReference: APPROVAL_REFERENCE,
          },
        },
      );
      await waitForTerminalJob(business.tenantId, restoreResult.jobId);
    }

    const finalReadBack = getProgramFromInfo(
      (await client.getProgramInfo(adjustment.upstreamProgramId)).data.programs,
      adjustment.upstreamProgramId,
    );
    const finalRestoreReady =
      adjustment.restoreMode === "YELP_SCHEDULED"
        ? hasScheduledRestore(
            finalReadBack.future_budget_changes,
            RESTORE_DATE,
            restoreBudgetCents,
          )
        : finalReadBack.future_budget_changes.length === 0;

    if (
      finalReadBack.program_metrics?.budget !== targetBudgetCents ||
      !finalRestoreReady
    ) {
      throw new Error(
        `${adjustment.label} failed final current/future budget verification.`,
      );
    }

    const configuration =
      typeof localProgram.configurationJson === "object" &&
      localProgram.configurationJson !== null &&
      !Array.isArray(localProgram.configurationJson)
        ? localProgram.configurationJson
        : {};
    await prisma.program.update({
      where: { id: localProgram.id },
      data: {
        configurationJson: toJsonValue({
          ...configuration,
          temporaryBudgetOverride: {
            approvalReference: APPROVAL_REFERENCE,
            dailyBudgetDollars: adjustment.dailyBudgetDollars,
            monthlyBudgetDollars: String(targetBudgetCents / 100),
            restoreDate: RESTORE_DATE,
            restoreMonthlyBudgetDollars: adjustment.restoreMonthlyBudgetDollars,
            restoreMode: adjustment.restoreMode,
            status:
              adjustment.restoreMode === "YELP_SCHEDULED"
                ? "PROVIDER_SCHEDULED"
                : "INTERNAL_SCHEDULED",
          },
        }),
      },
    });
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        dryRun: !apply,
        restoreDate: RESTORE_DATE,
        plan,
      },
      null,
      2,
    ),
  );
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
