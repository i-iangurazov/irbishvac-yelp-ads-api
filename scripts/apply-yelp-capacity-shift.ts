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
import { dailyBudgetDollarsToMonthlyBudgetCents } from "../lib/yelp/budget";
import { ensureYelpAccess } from "../lib/yelp/runtime";
import type { YelpUpstreamProgramDto } from "../lib/yelp/schemas";

const TERMINAL_JOB_STATUSES = new Set(["COMPLETED", "FAILED", "PARTIAL"]);
const PLUMBING_PROGRAM_ID = "ZKnDBk9eS2jJa7Xi3a3Cjg";
const PLUMBING_LAYER = "SEPTEMBER_PLUMBING";
const HVAC_DAILY_BUDGET_DOLLARS = "650";
const HVAC_TEMPORARY_BUDGET_CENTS = dailyBudgetDollarsToMonthlyBudgetCents(
  HVAC_DAILY_BUDGET_DOLLARS,
);

const hvacTargets = [
  {
    label: "HVAC Installation",
    campaignLayer: "SEPTEMBER_HVAC_INSTALLATION",
    upstreamProgramId: "DLJGvx-T0QQt8IXx8xUCCA",
    restoreBudgetCents: 1_200_000,
  },
  {
    label: "HVAC Service / Repair",
    campaignLayer: "SEPTEMBER_HVAC_REPAIR",
    upstreamProgramId: "chZwdNae5UHK2asYXSiizg",
    restoreBudgetCents: 1_200_000,
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

async function waitForPauseStatus(
  client: YelpAdsClient,
  upstreamProgramId: string,
  expected: "PAUSED" | "NOT_PAUSED",
) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const program = await readProgram(client, upstreamProgramId);
    if (program.program_pause_status === expected) return program;
    await sleep(2_000);
  }

  throw new Error(`Yelp did not confirm ${expected} for ${upstreamProgramId}.`);
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
  const upstreamIds = [
    PLUMBING_PROGRAM_ID,
    ...hvacTargets.map((target) => target.upstreamProgramId),
  ];
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

  const plumbing = localPrograms.find(
    (program) => program.upstreamProgramId === PLUMBING_PROGRAM_ID,
  )!;
  if (getProgramCampaignLayer(plumbing.configurationJson) !== PLUMBING_LAYER) {
    throw new Error(
      "The Plumbing program is not assigned to the approved layer.",
    );
  }
  for (const target of hvacTargets) {
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
  const plumbingUpstream = await readProgram(client, PLUMBING_PROGRAM_ID);
  const hvacUpstream = new Map<string, YelpUpstreamProgramDto>();

  const plumbingPauseStatus = plumbingUpstream.program_pause_status;
  const plumbingStatusIsValid =
    (plumbingPauseStatus === "NOT_PAUSED" &&
      plumbingUpstream.program_status === "ACTIVE") ||
    (plumbingPauseStatus === "PAUSED" &&
      ["ACTIVE", "INACTIVE"].includes(plumbingUpstream.program_status));
  if (plumbingUpstream.program_type !== "CPC" || !plumbingStatusIsValid) {
    throw new Error("Plumbing is not an active pausable Yelp CPC program.");
  }

  for (const target of hvacTargets) {
    const upstream = await readProgram(client, target.upstreamProgramId);
    if (
      upstream.program_status !== "ACTIVE" ||
      upstream.program_pause_status !== "NOT_PAUSED"
    ) {
      throw new Error(`${target.label} is not active and unpaused in Yelp.`);
    }
    if (
      upstream.program_metrics?.budget !== target.restoreBudgetCents &&
      upstream.program_metrics?.budget !== HVAC_TEMPORARY_BUDGET_CENTS
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
    hvacUpstream.set(target.upstreamProgramId, upstream);
  }

  const plan = {
    approvalReference: CAPACITY_SHIFT_APPROVAL_REFERENCE,
    restoreDate: CAPACITY_SHIFT_RESTORE_DATE,
    plumbing: {
      upstreamProgramId: PLUMBING_PROGRAM_ID,
      currentPauseStatus: plumbingUpstream.program_pause_status,
      action:
        plumbingUpstream.program_pause_status === "PAUSED"
          ? "KEEP_PAUSED"
          : "PAUSE",
      restoreAction: "RESUME",
    },
    hvac: hvacTargets.map((target) => ({
      label: target.label,
      upstreamProgramId: target.upstreamProgramId,
      currentBudgetCents:
        hvacUpstream.get(target.upstreamProgramId)?.program_metrics?.budget ??
        null,
      targetDailyBudgetDollars: HVAC_DAILY_BUDGET_DOLLARS,
      targetMonthlyBudgetCents: HVAC_TEMPORARY_BUDGET_CENTS,
      restoreMonthlyBudgetCents: target.restoreBudgetCents,
      scheduledRestoreExists: hasScheduledRestore(
        hvacUpstream.get(target.upstreamProgramId)?.future_budget_changes ?? [],
        target.restoreBudgetCents,
      ),
    })),
  };

  if (!apply) {
    console.log(JSON.stringify({ ok: true, dryRun: true, plan }, null, 2));
    return;
  }

  let plumbingPausedByThisRun = false;
  const changedHvac = new Set<string>();

  try {
    if (plumbingUpstream.program_pause_status !== "PAUSED") {
      const response = await client.pauseProgram(PLUMBING_PROGRAM_ID);
      await waitForPauseStatus(client, PLUMBING_PROGRAM_ID, "PAUSED");
      plumbingPausedByThisRun = true;
      await prisma.auditEvent.create({
        data: {
          tenantId: business.tenantId,
          actorId,
          businessId,
          programId: plumbing.id,
          actionType: "program.capacity-shift.pause",
          status: "SUCCESS",
          correlationId: response.correlationId,
          upstreamReference: PLUMBING_PROGRAM_ID,
          requestSummaryJson: toJsonValue({
            approvalReference: CAPACITY_SHIFT_APPROVAL_REFERENCE,
            restoreDate: CAPACITY_SHIFT_RESTORE_DATE,
          }),
        },
      });
    }

    for (const target of hvacTargets) {
      const localProgram = localPrograms.find(
        (candidate) => candidate.upstreamProgramId === target.upstreamProgramId,
      )!;
      await reconcilePendingJobs(business.tenantId, localProgram.id);
      let upstream = await readProgram(client, target.upstreamProgramId);

      if (upstream.program_metrics?.budget !== HVAC_TEMPORARY_BUDGET_CENTS) {
        const result = await updateProgramBudgetWorkflow(
          business.tenantId,
          actorId,
          localProgram.id,
          {
            operation: "CURRENT_BUDGET",
            currentBudgetDollars: String(HVAC_TEMPORARY_BUDGET_CENTS / 100),
            internalNote: `${CAPACITY_SHIFT_APPROVAL_REFERENCE}; $650/day while Plumbing is paused.`,
          },
          {
            approvedSeptemberOverride: {
              campaignLayer: target.campaignLayer,
              monthlyBudgetDollars: String(HVAC_TEMPORARY_BUDGET_CENTS / 100),
              approvalReference: CAPACITY_SHIFT_APPROVAL_REFERENCE,
            },
          },
        );
        changedHvac.add(target.upstreamProgramId);
        await waitForTerminalJob(business.tenantId, result.jobId);
      }

      upstream = await readProgram(client, target.upstreamProgramId);
      if (upstream.program_metrics?.budget !== HVAC_TEMPORARY_BUDGET_CENTS) {
        throw new Error(`${target.label} budget failed Yelp read-back.`);
      }

      const finalReadBack = await readProgram(client, target.upstreamProgramId);
      if (
        finalReadBack.program_metrics?.budget !== HVAC_TEMPORARY_BUDGET_CENTS
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
              dailyBudgetDollars: HVAC_DAILY_BUDGET_DOLLARS,
              monthlyBudgetDollars: String(HVAC_TEMPORARY_BUDGET_CENTS / 100),
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

    const plumbingConfiguration = asRecord(plumbing.configurationJson);
    await prisma.program.update({
      where: { id: plumbing.id },
      data: {
        configurationJson: toJsonValue({
          ...plumbingConfiguration,
          temporaryCapacityShift: {
            approvalReference: CAPACITY_SHIFT_APPROVAL_REFERENCE,
            restoreDate: CAPACITY_SHIFT_RESTORE_DATE,
            restoreMode: "INTERNAL_RESUME",
            status: "PAUSED",
          },
        }),
      },
    });

    console.log(
      JSON.stringify(
        {
          ok: true,
          dryRun: false,
          verified: true,
          plan,
          final: {
            plumbingPauseStatus: (
              await readProgram(client, PLUMBING_PROGRAM_ID)
            ).program_pause_status,
            hvacMonthlyBudgetCents: HVAC_TEMPORARY_BUDGET_CENTS,
            hvacDailyBudgetDollars: HVAC_DAILY_BUDGET_DOLLARS,
            restoreDate: CAPACITY_SHIFT_RESTORE_DATE,
          },
        },
        null,
        2,
      ),
    );
  } catch (error) {
    const rollbackErrors: string[] = [];

    for (const target of hvacTargets) {
      if (!changedHvac.has(target.upstreamProgramId)) continue;
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

    if (plumbingPausedByThisRun) {
      try {
        await client.resumeProgram(PLUMBING_PROGRAM_ID);
        await waitForPauseStatus(client, PLUMBING_PROGRAM_ID, "NOT_PAUSED");
      } catch (rollbackError) {
        rollbackErrors.push(
          `Plumbing: ${rollbackError instanceof Error ? rollbackError.message : "unknown rollback failure"}`,
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
