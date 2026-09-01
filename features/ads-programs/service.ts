import "server-only";

import { randomUUID } from "node:crypto";

import {
  findConflictingCpcPrograms,
  normalizeProgramCategoryAliases,
} from "@/features/ads-programs/conflicts";
import {
  evaluateMonthlyBudgetChange,
  getMonthlyBudgetPolicyState,
  YELP_MONTHLY_BUDGET_CAP_CENTS,
} from "@/features/ads-programs/budget-policy";
import {
  campaignLayerLabels,
  getProgramCampaignLayer,
  isSeptemberCampaignLayer,
  isTemporaryAugustCampaignLayer,
  septemberCampaigns,
  temporaryAugustCampaigns,
  type CampaignLayer,
} from "@/features/ads-programs/layers";
import {
  planSeptemberCampaignReconciliation,
  verifySeptemberCampaignReadBack,
} from "@/features/ads-programs/september-reconciliation";
import {
  planTemporaryAugustCampaignReconciliation,
  verifyTemporaryAugustCampaignReadBack,
} from "@/features/ads-programs/temporary-reconciliation";
import {
  isBusinessEligibleForProgramInventory,
  isCurrentLocalProgramStatus,
} from "@/features/ads-programs/status";
import {
  buildSynchronizedProgramConfiguration,
  parseSynchronizedProgramDate,
  resolveSynchronizedBudgetCents,
  resolveSynchronizedIsAutobid,
  resolveSynchronizedMaxBidCents,
  resolveSynchronizedProgramStatus,
  resolveSynchronizedProgramType,
} from "@/features/ads-programs/sync";
import { analyzeBusinessCpcTargeting } from "@/features/ads-programs/targeting";
import {
  createProgramFormSchema,
  editProgramFormSchema,
  programBudgetOperationSchema,
  programCategoryTargetingOperationSchema,
  septemberCampaignReconcileSchema,
  temporaryAugustCampaignReconcileSchema,
  terminateProgramFormSchema,
} from "@/features/ads-programs/schemas";
import { updateProgramFeatureWorkflow } from "@/features/program-features/service";
import { recordAuditEvent } from "@/features/audit/service";
import {
  findBusinessByEncryptedYelpBusinessId,
  getBusinessById,
} from "@/lib/db/businesses-repository";
import { updateBusinessRecord } from "@/lib/db/businesses-repository";
import { toJsonValue } from "@/lib/db/json";
import {
  createProgramJob,
  createProgramRecord,
  getProgramById,
  getProgramJob,
  listPendingProgramJobs,
  listPrograms,
  updateProgramJob,
  updateProgramRecord,
} from "@/lib/db/programs-repository";
import {
  mapCreateProgramFormToDto,
  mapEditProgramFormToDto,
  mapSubmittedYelpJob,
  mapTerminateProgramFormToDto,
  mapYelpJobStatusReceipt,
} from "@/lib/yelp/mappers";
import { ensureYelpAccess, getCapabilityFlags } from "@/lib/yelp/runtime";
import { YelpAdsClient } from "@/lib/yelp/ads-client";
import { YelpFeaturesClient } from "@/lib/yelp/features-client";
import {
  normalizeUnknownError,
  YelpMissingAccessError,
  YelpValidationError,
} from "@/lib/yelp/errors";
import { summarizeYelpJobIssue } from "@/lib/yelp/job-status";
import { parseCurrencyToCents } from "@/lib/utils/format";
import { pollUntil } from "@/lib/utils/polling";
import { extractYelpCategoryAliases } from "@/lib/yelp/categories";
import type { YelpUpstreamProgramDto } from "@/lib/yelp/schemas";

function mergeConfigurationJson(
  existing: unknown,
  patch: Record<string, unknown>,
) {
  const current =
    typeof existing === "object" && existing !== null
      ? (existing as Record<string, unknown>)
      : {};
  return {
    ...current,
    ...patch,
  };
}

function deriveProgramUpdateFromEditRequest(
  requestJson: unknown,
  currentConfigurationJson: unknown,
) {
  const request =
    typeof requestJson === "object" && requestJson !== null
      ? (requestJson as Record<string, unknown>)
      : {};
  const nextConfiguration = mergeConfigurationJson(currentConfigurationJson, {
    ...(typeof request.start === "string" ? { startDate: request.start } : {}),
    ...(typeof request.budget === "number" &&
    typeof request.future_budget_date !== "string"
      ? { monthlyBudgetDollars: String(request.budget / 100) }
      : {}),
    ...(typeof request.future_budget_date === "string" &&
    typeof request.budget === "number"
      ? {
          scheduledBudgetEffectiveDate: request.future_budget_date,
          scheduledBudgetDollars: String(request.budget / 100),
        }
      : {}),
    ...(typeof request.max_bid === "number"
      ? { maxBidDollars: String(request.max_bid / 100) }
      : {}),
    ...(typeof request.pacing_method === "string"
      ? { pacingMethod: request.pacing_method }
      : {}),
    ...(Array.isArray(request.ad_categories)
      ? { adCategories: request.ad_categories }
      : {}),
    ...(typeof request._campaignLayer === "string"
      ? { campaignLayer: request._campaignLayer }
      : {}),
  });

  return {
    ...(typeof request.start === "string"
      ? { startDate: new Date(request.start) }
      : {}),
    ...(typeof request.end === "string"
      ? { endDate: new Date(request.end) }
      : {}),
    ...(typeof request.budget === "number" &&
    typeof request.future_budget_date !== "string"
      ? { budgetCents: request.budget }
      : {}),
    ...(typeof request.max_bid === "number"
      ? { maxBidCents: request.max_bid }
      : {}),
    ...(typeof request.pacing_method === "string"
      ? { pacingMethod: request.pacing_method }
      : {}),
    ...(Array.isArray(request.ad_categories)
      ? { adCategoriesJson: request.ad_categories }
      : {}),
    configurationJson: nextConfiguration,
  };
}

function isRetryableStatusPollFailure(errorJson: unknown) {
  return (
    typeof errorJson === "object" &&
    errorJson !== null &&
    (errorJson as { source?: unknown }).source === "status_poll"
  );
}

function mergeBusinessReadinessJson(
  existing: unknown,
  patch: Record<string, unknown>,
) {
  const current =
    typeof existing === "object" && existing !== null
      ? (existing as Record<string, unknown>)
      : {};
  return {
    ...current,
    ...patch,
  };
}

function sameNormalizedAliases(left: unknown, right: unknown) {
  const leftAliases = normalizeProgramCategoryAliases(left);
  const rightAliases = normalizeProgramCategoryAliases(right);

  return (
    leftAliases.length === rightAliases.length &&
    leftAliases.every((alias) => rightAliases.includes(alias))
  );
}

function normalizeStoredPacingMethod(value: string | null) {
  if (value === "STANDARD") {
    return "paced";
  }

  if (value === "ACCELERATED") {
    return "unpaced";
  }

  return value;
}

function isDemoAdsMode(
  capabilities: Awaited<ReturnType<typeof getCapabilityFlags>>,
) {
  return capabilities.demoModeEnabled && !capabilities.adsApiEnabled;
}

function describeCategoryScope(categories: unknown) {
  const aliases = normalizeProgramCategoryAliases(categories);
  return aliases.length > 0
    ? aliases.join(", ")
    : "all categories inferred by Yelp";
}

function assertNoConflictingCpcPrograms(
  programs: Awaited<ReturnType<typeof listPrograms>>,
  requestedCategories: unknown,
  listingCategoryAliases: unknown,
  excludeProgramId?: string,
  requestedCampaignLayer: CampaignLayer = "GENERAL",
) {
  const conflicts = findConflictingCpcPrograms(
    programs,
    requestedCategories,
    excludeProgramId,
    {
      listingCategoryAliases,
      requestedCampaignLayer,
    },
  );

  if (conflicts.length === 0) {
    return;
  }

  const conflictReferences = conflicts
    .map((program) => {
      const reference = program.upstreamProgramId ?? program.id;
      return `${reference} (${describeCategoryScope(program.adCategoriesJson)})`;
    })
    .join(", ");

  throw new YelpValidationError(
    `A CPC program already exists for this business with overlapping category targeting. Existing program(s): ${conflictReferences}. Edit the existing program or terminate it before creating another.`,
  );
}

function assertMonthlyBudgetPolicy(
  programs: Awaited<ReturnType<typeof listPrograms>>,
  proposedBudgetCents: number,
  excludeProgramId?: string,
) {
  const policy = evaluateMonthlyBudgetChange(
    programs,
    proposedBudgetCents,
    excludeProgramId,
  );

  if (policy.isAllowed) {
    return;
  }

  throw new YelpValidationError(
    `This campaign would have a $${(policy.projectedBudgetCents / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })} monthly budget. The approved maximum for each Yelp campaign is $${(YELP_MONTHLY_BUDGET_CAP_CENTS / 100).toLocaleString("en-US")}.`,
  );
}

export function deduplicateProgramsByUpstreamId<
  T extends { id: string; upstreamProgramId: string | null; updatedAt: Date },
>(programs: T[]) {
  const unique = new Map<string, T>();

  for (const program of programs) {
    const key = program.upstreamProgramId
      ? `yelp:${program.upstreamProgramId}`
      : `local:${program.id}`;
    const existing = unique.get(key);

    if (!existing || program.updatedAt > existing.updatedAt) {
      unique.set(key, program);
    }
  }

  return [...unique.values()];
}

function assertProgramCanBeTerminated(
  program: Awaited<ReturnType<typeof getProgramById>>,
) {
  if (program.status === "ENDED") {
    throw new YelpValidationError("This program is already ended.");
  }

  if (
    program.status === "QUEUED" ||
    program.status === "PROCESSING" ||
    program.jobs?.some(
      (job) => job.status === "QUEUED" || job.status === "PROCESSING",
    )
  ) {
    throw new YelpValidationError(
      "Wait for the current Yelp job to finish before submitting termination.",
    );
  }

  if (!program.upstreamProgramId) {
    throw new YelpValidationError(
      "This program has no confirmed Yelp program ID yet. Its create job never completed successfully on Yelp, so there is nothing upstream to terminate.",
    );
  }

  return program.upstreamProgramId;
}

function assertProgramCanBeMutated(
  program: Awaited<ReturnType<typeof getProgramById>>,
  actionLabel: string,
): string;
function assertProgramCanBeMutated(
  program: Awaited<ReturnType<typeof getProgramById>>,
  actionLabel: string,
  requireUpstreamProgramId: true,
): string;
function assertProgramCanBeMutated(
  program: Awaited<ReturnType<typeof getProgramById>>,
  actionLabel: string,
  requireUpstreamProgramId: false,
): string | null;
function assertProgramCanBeMutated(
  program: Awaited<ReturnType<typeof getProgramById>>,
  actionLabel: string,
  requireUpstreamProgramId = true,
) {
  if (program.status === "ENDED") {
    throw new YelpValidationError(
      `This program is already ended and cannot be used for ${actionLabel}.`,
    );
  }

  if (program.status === "QUEUED" || program.status === "PROCESSING") {
    throw new YelpValidationError(
      `Wait for the current Yelp job to finish before ${actionLabel}.`,
    );
  }

  const pendingJob = program.jobs?.find(
    (job) => job.status === "QUEUED" || job.status === "PROCESSING",
  );
  if (pendingJob) {
    throw new YelpValidationError(
      `Wait for the current Yelp job to finish before ${actionLabel}.`,
    );
  }

  if (requireUpstreamProgramId && !program.upstreamProgramId) {
    throw new YelpValidationError(
      `This program has no confirmed Yelp program ID yet. Its create job never completed successfully on Yelp, so ${actionLabel} is not possible upstream.`,
    );
  }

  return program.upstreamProgramId;
}

export async function getProgramsIndex(tenantId: string) {
  const programs = await listPrograms(tenantId);
  return deduplicateProgramsByUpstreamId(
    programs.filter(
      (program) =>
        isCurrentLocalProgramStatus(program.status) &&
        isBusinessEligibleForProgramInventory(program.business),
    ),
  );
}

export async function getProgramBudgetPolicy(tenantId: string) {
  return getMonthlyBudgetPolicyState(await getProgramsIndex(tenantId));
}

export async function getProgramDetail(tenantId: string, programId: string) {
  return getProgramById(programId, tenantId);
}

export async function syncBusinessProgramsFromYelpWorkflow(
  tenantId: string,
  actorId: string,
  businessId: string,
) {
  const [business, capabilities] = await Promise.all([
    getBusinessById(businessId, tenantId),
    getCapabilityFlags(tenantId),
  ]);

  if (isDemoAdsMode(capabilities)) {
    throw new YelpValidationError(
      "Program sync is unavailable while Yelp Ads is running in demo mode.",
    );
  }

  const { credential } = await ensureYelpAccess({
    tenantId,
    capabilityKey: "adsApiEnabled",
    credentialKind: "ADS_BASIC_AUTH",
  });
  const client = new YelpAdsClient(credential);
  const response = await client.listPrograms(business.encryptedYelpBusinessId);
  const upstreamPrograms =
    response.data.businesses.find(
      (entry: (typeof response.data.businesses)[number]) =>
        entry.yelp_business_id === business.encryptedYelpBusinessId,
    )?.programs ?? [];
  const syncedAt = new Date();
  const existingProgramsByUpstreamId = new Map(
    business.programs
      .filter((program) => Boolean(program.upstreamProgramId))
      .map((program) => [program.upstreamProgramId as string, program]),
  );
  let createdPrograms = 0;
  let updatedPrograms = 0;
  let skippedPrograms = 0;
  let endedPrograms = 0;

  for (const upstreamProgram of upstreamPrograms) {
    const programType = resolveSynchronizedProgramType(
      upstreamProgram.program_type,
    );

    if (!programType) {
      skippedPrograms += 1;
      continue;
    }

    const existingProgram = existingProgramsByUpstreamId.get(
      upstreamProgram.program_id,
    );
    const budgetCents =
      resolveSynchronizedBudgetCents(upstreamProgram) ??
      existingProgram?.budgetCents ??
      null;
    const maxBidCents =
      resolveSynchronizedMaxBidCents(upstreamProgram) ??
      existingProgram?.maxBidCents ??
      null;
    const isAutobid =
      resolveSynchronizedIsAutobid(upstreamProgram) ??
      existingProgram?.isAutobid ??
      null;
    const feePeriod =
      upstreamProgram.program_metrics?.fee_period ??
      existingProgram?.feePeriod ??
      null;
    const nextConfiguration = buildSynchronizedProgramConfiguration(
      upstreamProgram,
      existingProgram?.configurationJson,
      {
        budgetCents,
        maxBidCents,
        isAutobid,
        feePeriod,
        syncedAt,
      },
    );
    const synchronizedProgramData = {
      type: programType,
      status: resolveSynchronizedProgramStatus(upstreamProgram.program_status),
      upstreamProgramId: upstreamProgram.program_id,
      currency:
        upstreamProgram.program_metrics?.currency ??
        existingProgram?.currency ??
        "USD",
      budgetCents,
      maxBidCents,
      isAutobid,
      pacingMethod: existingProgram?.pacingMethod ?? null,
      feePeriod,
      startDate:
        parseSynchronizedProgramDate(upstreamProgram.start_date) ??
        existingProgram?.startDate ??
        null,
      endDate: parseSynchronizedProgramDate(upstreamProgram.end_date),
      adCategoriesJson: toJsonValue(upstreamProgram.ad_categories),
      configurationJson: toJsonValue(nextConfiguration),
      summaryJson: toJsonValue(upstreamProgram),
      lastSyncedAt: syncedAt,
    };

    if (existingProgram) {
      await updateProgramRecord(
        existingProgram.id,
        tenantId,
        synchronizedProgramData,
      );
      updatedPrograms += 1;
      continue;
    }

    const createdProgram = await createProgramRecord(
      tenantId,
      business.id,
      synchronizedProgramData,
    );
    createdPrograms += 1;

    await recordAuditEvent({
      tenantId,
      actorId,
      businessId: business.id,
      programId: createdProgram.id,
      actionType: "program.sync.import",
      status: "SUCCESS",
      upstreamReference: upstreamProgram.program_id,
      requestSummary: toJsonValue({
        source: "yelp_program_list",
        businessId: business.encryptedYelpBusinessId,
      }),
      responseSummary: toJsonValue({
        programType: upstreamProgram.program_type,
        programStatus: upstreamProgram.program_status,
      }),
      after: synchronizedProgramData as never,
    });
  }

  const upstreamProgramIds = new Set(
    upstreamPrograms.map(
      (program: YelpUpstreamProgramDto) => program.program_id,
    ),
  );

  for (const existingProgram of business.programs) {
    if (
      !existingProgram.upstreamProgramId ||
      !isCurrentLocalProgramStatus(existingProgram.status) ||
      upstreamProgramIds.has(existingProgram.upstreamProgramId)
    ) {
      continue;
    }

    await updateProgramRecord(existingProgram.id, tenantId, {
      status: "ENDED",
      lastSyncedAt: syncedAt,
      configurationJson: toJsonValue(
        mergeConfigurationJson(existingProgram.configurationJson, {
          lastUpstreamProgramStatus: "MISSING_FROM_PROGRAM_LIST",
          missingFromProgramListAt: syncedAt.toISOString(),
        }),
      ),
    });
    endedPrograms += 1;
  }

  const nextRawSnapshot =
    typeof business.rawSnapshotJson === "object" &&
    business.rawSnapshotJson !== null
      ? {
          ...(business.rawSnapshotJson as Record<string, unknown>),
          liveProgramSync: {
            syncedAt: syncedAt.toISOString(),
            upstreamProgramCount: upstreamPrograms.length,
            programs: upstreamPrograms,
          },
        }
      : {
          liveProgramSync: {
            syncedAt: syncedAt.toISOString(),
            upstreamProgramCount: upstreamPrograms.length,
            programs: upstreamPrograms,
          },
        };

  const refreshedPrograms = await listPrograms(tenantId, business.id);
  const targetingIssues = analyzeBusinessCpcTargeting(
    refreshedPrograms,
    business.categoriesJson,
  );

  await updateBusinessRecord(business.id, tenantId, {
    rawSnapshotJson: nextRawSnapshot,
    readinessJson: mergeBusinessReadinessJson(business.readinessJson, {
      cpcTargetingStatus:
        targetingIssues.length > 0 ? "NEEDS_REVIEW" : "HEALTHY",
      cpcTargetingIssueCodes: targetingIssues.map((issue) => issue.code),
      cpcTargetingCheckedAt: syncedAt.toISOString(),
    }),
  });

  await recordAuditEvent({
    tenantId,
    actorId,
    businessId: business.id,
    actionType: "business.programs.sync",
    status: "SUCCESS",
    requestSummary: toJsonValue({
      source: "yelp_program_list",
      businessId: business.encryptedYelpBusinessId,
    }),
    responseSummary: toJsonValue({
      createdPrograms,
      updatedPrograms,
      skippedPrograms,
      endedPrograms,
      totalPrograms: upstreamPrograms.length,
      targetingIssues: targetingIssues.map((issue) => ({
        code: issue.code,
        title: issue.title,
        programIds: issue.programIds,
      })),
    }),
    after: nextRawSnapshot as never,
  });

  return {
    businessId: business.id,
    createdPrograms,
    updatedPrograms,
    skippedPrograms,
    endedPrograms,
    totalPrograms: upstreamPrograms.length,
    targetingIssues,
    syncedAt: syncedAt.toISOString(),
    message:
      targetingIssues.length > 0
        ? `Imported ${createdPrograms}, refreshed ${updatedPrograms}, and retired ${endedPrograms} stale local programs. Targeting review required: ${targetingIssues.map((issue) => issue.title).join("; ")}.`
        : `Imported ${createdPrograms}, refreshed ${updatedPrograms}, and retired ${endedPrograms} stale local programs. CPC targeting checks passed.`,
  };
}

export async function syncAllCurrentProgramsFromYelpWorkflow(
  tenantId: string,
  actorId: string,
) {
  const currentPrograms = await getProgramsIndex(tenantId);
  const businessIds = [
    ...new Set(currentPrograms.map((program) => program.businessId)),
  ];
  const results = [];

  for (const businessId of businessIds) {
    results.push(
      await syncBusinessProgramsFromYelpWorkflow(tenantId, actorId, businessId),
    );
  }

  const createdPrograms = results.reduce(
    (total, result) => total + result.createdPrograms,
    0,
  );
  const updatedPrograms = results.reduce(
    (total, result) => total + result.updatedPrograms,
    0,
  );
  const endedPrograms = results.reduce(
    (total, result) => total + result.endedPrograms,
    0,
  );

  return {
    businessCount: businessIds.length,
    createdPrograms,
    updatedPrograms,
    endedPrograms,
    message: `Yelp-reported billing-period spend refreshed for ${updatedPrograms} current programs across ${businessIds.length} business records; ${endedPrograms} stale local records retired.`,
  };
}

export async function reconcileTemporaryAugustCampaignWorkflow(
  tenantId: string,
  actorId: string,
  input: unknown,
) {
  const values = temporaryAugustCampaignReconcileSchema.parse(input);
  const business = await getBusinessById(values.businessId, tenantId);
  const { credential } = await ensureYelpAccess({
    tenantId,
    capabilityKey: "adsApiEnabled",
    credentialKind: "ADS_BASIC_AUTH",
  });
  const client = new YelpAdsClient(credential);
  const inventoryResponse = await client.listPrograms(
    business.encryptedYelpBusinessId,
  );
  const inventoryBusiness = inventoryResponse.data.businesses.find(
    (entry) => entry.yelp_business_id === business.encryptedYelpBusinessId,
  );

  if (!inventoryBusiness) {
    throw new YelpValidationError(
      "Yelp did not return the selected canonical business during the required read-only inventory.",
    );
  }

  if (
    inventoryBusiness.destination_yelp_business_id &&
    inventoryBusiness.destination_yelp_business_id !==
      business.encryptedYelpBusinessId
  ) {
    const destination = await findBusinessByEncryptedYelpBusinessId(
      tenantId,
      inventoryBusiness.destination_yelp_business_id,
    );
    throw new YelpValidationError(
      destination
        ? `The selected Yelp business redirects to canonical local business ${destination.id}. Run reconciliation from that business record.`
        : "The selected Yelp business redirects to a canonical Yelp destination that is not saved locally. Save the destination business before campaign mutation.",
    );
  }

  const upstreamPrograms = inventoryBusiness.programs;
  const plan = planTemporaryAugustCampaignReconciliation({
    layer: values.campaignLayer,
    localPrograms: business.programs,
    upstreamPrograms,
  });

  await recordAuditEvent({
    tenantId,
    actorId,
    businessId: business.id,
    actionType: "program.temporary.inventory",
    status: plan.action === "BLOCKED" ? "FAILED" : "SUCCESS",
    correlationId: inventoryResponse.correlationId,
    requestSummary: toJsonValue({
      campaignLayer: values.campaignLayer,
      dryRun: values.dryRun,
      source: "yelp_program_list",
    }),
    responseSummary: toJsonValue({
      plan,
      upstreamPrograms: upstreamPrograms.map(
        (program: YelpUpstreamProgramDto) => ({
          programId: program.program_id,
          type: program.program_type,
          status: program.program_status,
          categories: program.ad_categories,
          budgetCents: program.program_metrics?.budget ?? null,
          startDate: program.start_date ?? null,
          endDate: program.end_date ?? null,
        }),
      ),
    }),
  });

  if (values.dryRun) {
    return {
      dryRun: true,
      plan,
      canonicalBusinessId: business.id,
      upstreamProgramCount: upstreamPrograms.length,
    };
  }

  if (plan.action === "BLOCKED") {
    throw new YelpValidationError(plan.reason);
  }

  const specification = temporaryAugustCampaigns[values.campaignLayer];
  let programId = plan.localProgramId;
  let upstreamProgramId = plan.upstreamProgramId;
  let jobId: string | null = null;

  if (!programId && upstreamProgramId) {
    await syncBusinessProgramsFromYelpWorkflow(tenantId, actorId, business.id);
    const synchronized = (await listPrograms(tenantId, business.id)).find(
      (program) => program.upstreamProgramId === upstreamProgramId,
    );

    if (!synchronized) {
      throw new YelpValidationError(
        "The canonical Yelp program could not be linked to a local tenant-scoped record.",
      );
    }

    programId = synchronized.id;
  }

  if (plan.action === "CREATE") {
    const created = await createProgramWorkflow(tenantId, actorId, {
      businessId: business.id,
      programType: "CPC",
      currency: "USD",
      endDate: specification.endDate,
      monthlyBudgetDollars: specification.monthlyBudgetDollars,
      isAutobid: true,
      pacingMethod: "paced",
      feePeriod: "CALENDAR_MONTH",
      campaignLayer: values.campaignLayer,
      adCategories: [specification.categoryAlias],
      notes: "Approved temporary campaign through August 31, 2026.",
    });
    programId = created.programId;
    jobId = created.jobId;
  }

  if (plan.action === "UPDATE") {
    if (!programId) {
      throw new YelpValidationError(
        "The canonical program is missing its tenant-scoped local record.",
      );
    }

    const program = await getProgramById(programId, tenantId);

    if (program.isAutobid === false && !program.maxBidCents) {
      throw new YelpValidationError(
        "The existing manual-bid campaign has no max bid, so it cannot be updated safely.",
      );
    }

    const edited = await editProgramWorkflow(tenantId, actorId, {
      businessId: business.id,
      programId,
      programType: "CPC",
      currency: program.currency,
      startDate: program.startDate
        ? program.startDate.toISOString().slice(0, 10)
        : undefined,
      endDate: specification.endDate,
      monthlyBudgetDollars: specification.monthlyBudgetDollars,
      isAutobid: program.isAutobid ?? true,
      maxBidDollars:
        program.isAutobid === false && program.maxBidCents
          ? String(program.maxBidCents / 100)
          : undefined,
      pacingMethod:
        normalizeStoredPacingMethod(program.pacingMethod) === "unpaced"
          ? "unpaced"
          : "paced",
      feePeriod:
        program.feePeriod === "ROLLING_MONTH"
          ? "ROLLING_MONTH"
          : "CALENDAR_MONTH",
      campaignLayer: values.campaignLayer,
      adCategories: [specification.categoryAlias],
      notes: "Approved temporary campaign through August 31, 2026.",
    });
    jobId = edited.jobId;
  }

  if (jobId) {
    const completedJob = await pollProgramJobWorkflow(tenantId, jobId);

    if (completedJob.status !== "COMPLETED") {
      throw new YelpValidationError(
        `Yelp did not confirm the temporary campaign mutation. Job status: ${completedJob.status}.`,
      );
    }

    upstreamProgramId = completedJob.program?.upstreamProgramId ?? null;
  }

  if (!programId || !upstreamProgramId) {
    throw new YelpValidationError(
      "The temporary campaign does not have confirmed local and Yelp program IDs after reconciliation.",
    );
  }

  const refreshedResponse = await client.listPrograms(
    business.encryptedYelpBusinessId,
  );
  const refreshedPrograms =
    refreshedResponse.data.businesses.find(
      (entry) => entry.yelp_business_id === business.encryptedYelpBusinessId,
    )?.programs ?? [];
  const verification = verifyTemporaryAugustCampaignReadBack({
    layer: values.campaignLayer,
    upstreamProgramId,
    upstreamPrograms: refreshedPrograms,
  });

  if (!verification.verified) {
    await recordAuditEvent({
      tenantId,
      actorId,
      businessId: business.id,
      programId,
      actionType: "program.temporary.read-back",
      status: "FAILED",
      correlationId: refreshedResponse.correlationId,
      upstreamReference: upstreamProgramId,
      requestSummary: toJsonValue({ campaignLayer: values.campaignLayer }),
      responseSummary: toJsonValue(verification),
    });
    throw new YelpValidationError(verification.reason);
  }

  const localProgram = await getProgramById(programId, tenantId);
  await updateProgramRecord(programId, tenantId, {
    configurationJson: toJsonValue(
      mergeConfigurationJson(localProgram.configurationJson, {
        campaignLayer: values.campaignLayer,
        temporaryCampaignVerifiedAt: new Date().toISOString(),
      }),
    ),
  });
  await syncBusinessProgramsFromYelpWorkflow(tenantId, actorId, business.id);
  await recordAuditEvent({
    tenantId,
    actorId,
    businessId: business.id,
    programId,
    actionType: "program.temporary.read-back",
    status: "SUCCESS",
    correlationId: refreshedResponse.correlationId,
    upstreamReference: upstreamProgramId,
    requestSummary: toJsonValue({ campaignLayer: values.campaignLayer }),
    responseSummary: toJsonValue({
      verification,
      budgetCents: Number(specification.monthlyBudgetDollars) * 100,
      endDate: specification.endDate,
      categoryAlias: specification.categoryAlias,
    }),
  });

  return {
    dryRun: false,
    action: plan.action,
    programId,
    upstreamProgramId,
    jobId,
    verified: true,
    verification: verification.reason,
  };
}

async function inspectSeptemberServiceTargetingAccess(
  tenantId: string,
  probeProgramId: string,
) {
  try {
    const { credential } = await ensureYelpAccess({
      tenantId,
      capabilityKey: "programFeatureApiEnabled",
      credentialKind: "DATA_INGESTION",
    });
    const response = await new YelpFeaturesClient(
      credential,
    ).getProgramFeatures(probeProgramId);
    const supported = Object.prototype.hasOwnProperty.call(
      response.data.features,
      "NEGATIVE_KEYWORD_TARGETING",
    );

    return {
      ready: supported,
      message: supported
        ? "Yelp Program Features access and Negative Keyword Targeting were verified."
        : "Yelp Program Features responded, but Negative Keyword Targeting is unavailable for the probe campaign.",
    };
  } catch (error) {
    return {
      ready: false,
      message: normalizeUnknownError(error).message,
    };
  }
}

export async function reconcileSeptemberCampaignWorkflow(
  tenantId: string,
  actorId: string,
  input: unknown,
) {
  const values = septemberCampaignReconcileSchema.parse(input);
  const business = await getBusinessById(values.businessId, tenantId);
  const specification = septemberCampaigns[values.campaignLayer];
  const { credential } = await ensureYelpAccess({
    tenantId,
    capabilityKey: "adsApiEnabled",
    credentialKind: "ADS_BASIC_AUTH",
  });
  const client = new YelpAdsClient(credential);
  const inventoryResponse = await client.listPrograms(
    business.encryptedYelpBusinessId,
  );
  const inventoryBusiness = inventoryResponse.data.businesses.find(
    (entry) => entry.yelp_business_id === business.encryptedYelpBusinessId,
  );

  if (!inventoryBusiness) {
    throw new YelpValidationError(
      "Yelp did not return the selected canonical business during the required read-only inventory.",
    );
  }

  if (
    inventoryBusiness.destination_yelp_business_id &&
    inventoryBusiness.destination_yelp_business_id !==
      business.encryptedYelpBusinessId
  ) {
    const destination = await findBusinessByEncryptedYelpBusinessId(
      tenantId,
      inventoryBusiness.destination_yelp_business_id,
    );
    throw new YelpValidationError(
      destination
        ? `The selected Yelp business redirects to canonical local business ${destination.id}. Run reconciliation from that business record.`
        : "The selected Yelp business redirects to a canonical Yelp destination that is not saved locally. Save the destination business before campaign mutation.",
    );
  }

  const upstreamPrograms = inventoryBusiness.programs;
  const mainProgram = upstreamPrograms.find(
    (program: YelpUpstreamProgramDto) =>
      program.program_id === values.mainProgramId,
  );
  const mainReady =
    mainProgram?.program_type === "CPC" &&
    mainProgram.program_status === "ACTIVE" &&
    mainProgram.program_metrics?.budget === 1_000_000;
  const mainPrerequisite = {
    ready: mainReady,
    programId: values.mainProgramId,
    observedBudgetCents: mainProgram?.program_metrics?.budget ?? null,
    observedStatus: mainProgram?.program_status ?? null,
    message: mainReady
      ? "The manually managed main campaign is active at the approved $10,000 monthly budget."
      : mainProgram
        ? "The manually managed main campaign must be active at exactly $10,000 before another September layer can be applied."
        : "The supplied main campaign ID is absent from the canonical Yelp inventory.",
  };
  const providerTargeting = specification.requiresServiceTargeting
    ? await inspectSeptemberServiceTargetingAccess(
        tenantId,
        values.mainProgramId,
      )
    : {
        ready: true,
        message: "This layer does not require Yelp Program Features targeting.",
      };
  const serviceTargeting = {
    required: specification.requiresServiceTargeting,
    ready:
      !specification.requiresServiceTargeting ||
      (providerTargeting.ready &&
        values.serviceTargetingConfirmed &&
        values.blockedKeywords.length > 0),
    providerReady: providerTargeting.ready,
    confirmed: values.serviceTargetingConfirmed,
    blockedKeywordCount: values.blockedKeywords.length,
    message: !specification.requiresServiceTargeting
      ? providerTargeting.message
      : !providerTargeting.ready
        ? providerTargeting.message
        : !values.serviceTargetingConfirmed ||
            values.blockedKeywords.length === 0
          ? "An operator-approved non-empty negative-keyword policy is required for this service-specific HVAC layer."
          : "The service-targeting access and approved negative-keyword policy are ready.",
  };
  const plan = planSeptemberCampaignReconciliation({
    layer: values.campaignLayer,
    localPrograms: business.programs,
    upstreamPrograms,
    adoptUpstreamProgramId: values.adoptUpstreamProgramId,
  });
  const blockers = [
    ...(mainPrerequisite.ready ? [] : [mainPrerequisite.message]),
    ...(serviceTargeting.ready ? [] : [serviceTargeting.message]),
    ...(plan.action === "BLOCKED" ? [plan.reason] : []),
  ];

  await recordAuditEvent({
    tenantId,
    actorId,
    businessId: business.id,
    actionType: "program.september.inventory",
    status: blockers.length === 0 ? "SUCCESS" : "FAILED",
    correlationId: inventoryResponse.correlationId,
    requestSummary: toJsonValue({
      campaignLayer: values.campaignLayer,
      dryRun: values.dryRun,
      source: "yelp_program_list",
      mainProgramId: values.mainProgramId,
      adoptUpstreamProgramId: values.adoptUpstreamProgramId ?? null,
      serviceTargetingConfirmed: values.serviceTargetingConfirmed,
      blockedKeywordCount: values.blockedKeywords.length,
    }),
    responseSummary: toJsonValue({
      plan,
      mainPrerequisite,
      serviceTargeting,
      blockers,
      upstreamPrograms: upstreamPrograms.map(
        (program: YelpUpstreamProgramDto) => ({
          programId: program.program_id,
          type: program.program_type,
          status: program.program_status,
          categories: program.ad_categories,
          budgetCents: program.program_metrics?.budget ?? null,
          startDate: program.start_date ?? null,
          endDate: program.end_date ?? null,
        }),
      ),
    }),
  });

  if (values.dryRun) {
    return {
      dryRun: true,
      readyForApply: blockers.length === 0,
      plan,
      mainPrerequisite,
      serviceTargeting,
      blockers,
      canonicalBusinessId: business.id,
      upstreamProgramCount: upstreamPrograms.length,
    };
  }

  if (blockers.length > 0) {
    throw new YelpValidationError(blockers.join(" "));
  }

  await syncBusinessProgramsFromYelpWorkflow(tenantId, actorId, business.id);
  const synchronizedPrograms = await listPrograms(tenantId, business.id);
  const synchronizedMain = synchronizedPrograms.find(
    (program) => program.upstreamProgramId === values.mainProgramId,
  );

  if (!synchronizedMain) {
    throw new YelpValidationError(
      "The verified main Yelp campaign could not be linked to a local tenant-scoped record.",
    );
  }

  await updateProgramRecord(synchronizedMain.id, tenantId, {
    configurationJson: toJsonValue(
      mergeConfigurationJson(synchronizedMain.configurationJson, {
        campaignLayer: "MAIN",
        displayName: "IRBIS Main Campaign",
        managedExternally: true,
        mainCampaignVerifiedAt: new Date().toISOString(),
      }),
    ),
  });

  const liveLocalPrograms = await listPrograms(tenantId, business.id);
  const livePlan = planSeptemberCampaignReconciliation({
    layer: values.campaignLayer,
    localPrograms: liveLocalPrograms,
    upstreamPrograms,
    adoptUpstreamProgramId: values.adoptUpstreamProgramId,
  });

  if (livePlan.action === "BLOCKED") {
    throw new YelpValidationError(livePlan.reason);
  }

  let programId = livePlan.localProgramId;
  let upstreamProgramId = livePlan.upstreamProgramId;
  let jobId: string | null = null;

  if (!programId && upstreamProgramId) {
    const synchronized = liveLocalPrograms.find(
      (program) => program.upstreamProgramId === upstreamProgramId,
    );

    if (!synchronized) {
      throw new YelpValidationError(
        "The selected Yelp program could not be linked to a local tenant-scoped record.",
      );
    }

    programId = synchronized.id;
  }

  if (
    specification.requiresServiceTargeting &&
    programId &&
    livePlan.action !== "CREATE"
  ) {
    await updateProgramFeatureWorkflow(
      tenantId,
      actorId,
      programId,
      {
        type: "NEGATIVE_KEYWORD_TARGETING",
        blockedKeywords: values.blockedKeywords,
      },
      { approvedSeptemberReconciliation: true },
    );
  }

  if (livePlan.action === "CREATE") {
    const created = await createProgramWorkflow(
      tenantId,
      actorId,
      {
        businessId: business.id,
        programType: "CPC",
        currency: "USD",
        startDate: specification.startDate,
        endDate: specification.endDate,
        monthlyBudgetDollars: specification.monthlyBudgetDollars,
        isAutobid: true,
        pacingMethod: "paced",
        feePeriod: "CALENDAR_MONTH",
        campaignLayer: values.campaignLayer,
        adCategories: [...specification.categoryAliases],
        notes: "Approved September 2026 Yelp campaign structure.",
      },
      { approvedSeptemberReconciliation: true },
    );
    programId = created.programId;
    jobId = created.jobId;
  }

  if (livePlan.action === "UPDATE") {
    if (!programId) {
      throw new YelpValidationError(
        "The selected Yelp program is missing its tenant-scoped local record.",
      );
    }

    const program = await getProgramById(programId, tenantId);

    if (program.isAutobid === false && !program.maxBidCents) {
      throw new YelpValidationError(
        "The existing manual-bid campaign has no max bid, so it cannot be updated safely.",
      );
    }

    const edited = await editProgramWorkflow(
      tenantId,
      actorId,
      {
        businessId: business.id,
        programId,
        programType: "CPC",
        currency: program.currency,
        startDate: program.startDate
          ? program.startDate.toISOString().slice(0, 10)
          : specification.startDate,
        endDate: specification.endDate,
        monthlyBudgetDollars: specification.monthlyBudgetDollars,
        isAutobid: program.isAutobid ?? true,
        maxBidDollars:
          program.isAutobid === false && program.maxBidCents
            ? String(program.maxBidCents / 100)
            : undefined,
        pacingMethod:
          normalizeStoredPacingMethod(program.pacingMethod) === "unpaced"
            ? "unpaced"
            : "paced",
        feePeriod:
          program.feePeriod === "ROLLING_MONTH"
            ? "ROLLING_MONTH"
            : "CALENDAR_MONTH",
        campaignLayer: values.campaignLayer,
        adCategories: [...specification.categoryAliases],
        notes: "Approved September 2026 Yelp campaign structure.",
      },
      { approvedSeptemberReconciliation: true },
    );
    jobId = edited.jobId;
  }

  if (jobId) {
    const completedJob = await pollProgramJobWorkflow(tenantId, jobId);

    if (completedJob.status !== "COMPLETED") {
      throw new YelpValidationError(
        `Yelp did not confirm the September campaign mutation. Job status: ${completedJob.status}.`,
      );
    }

    upstreamProgramId = completedJob.program?.upstreamProgramId ?? null;
  }

  if (!programId || !upstreamProgramId) {
    throw new YelpValidationError(
      "The September campaign does not have confirmed local and Yelp program IDs after reconciliation.",
    );
  }

  if (specification.requiresServiceTargeting && livePlan.action === "CREATE") {
    try {
      await updateProgramFeatureWorkflow(
        tenantId,
        actorId,
        programId,
        {
          type: "NEGATIVE_KEYWORD_TARGETING",
          blockedKeywords: values.blockedKeywords,
        },
        { approvedSeptemberReconciliation: true },
      );
    } catch (error) {
      const termination = await terminateProgramWorkflow(tenantId, actorId, {
        programId,
        reason:
          "Automatic safety termination: Yelp service targeting failed after campaign creation.",
      });
      await pollProgramJobWorkflow(tenantId, termination.jobId);
      throw error;
    }
  }

  const refreshedResponse = await client.listPrograms(
    business.encryptedYelpBusinessId,
  );
  const refreshedPrograms =
    refreshedResponse.data.businesses.find(
      (entry) => entry.yelp_business_id === business.encryptedYelpBusinessId,
    )?.programs ?? [];
  const verification = verifySeptemberCampaignReadBack({
    layer: values.campaignLayer,
    upstreamProgramId,
    upstreamPrograms: refreshedPrograms,
  });

  if (!verification.verified) {
    await recordAuditEvent({
      tenantId,
      actorId,
      businessId: business.id,
      programId,
      actionType: "program.september.read-back",
      status: "FAILED",
      correlationId: refreshedResponse.correlationId,
      upstreamReference: upstreamProgramId,
      requestSummary: toJsonValue({ campaignLayer: values.campaignLayer }),
      responseSummary: toJsonValue(verification),
    });
    throw new YelpValidationError(verification.reason);
  }

  const localProgram = await getProgramById(programId, tenantId);
  await updateProgramRecord(programId, tenantId, {
    configurationJson: toJsonValue(
      mergeConfigurationJson(localProgram.configurationJson, {
        campaignLayer: values.campaignLayer,
        displayName: campaignLayerLabels[values.campaignLayer],
        septemberCampaignVerifiedAt: new Date().toISOString(),
        serviceTargetingConfirmed: values.serviceTargetingConfirmed,
      }),
    ),
  });
  await syncBusinessProgramsFromYelpWorkflow(tenantId, actorId, business.id);
  await recordAuditEvent({
    tenantId,
    actorId,
    businessId: business.id,
    programId,
    actionType: "program.september.read-back",
    status: "SUCCESS",
    correlationId: refreshedResponse.correlationId,
    upstreamReference: upstreamProgramId,
    requestSummary: toJsonValue({
      campaignLayer: values.campaignLayer,
      blockedKeywordCount: values.blockedKeywords.length,
    }),
    responseSummary: toJsonValue({
      verification,
      budgetCents: Number(specification.monthlyBudgetDollars) * 100,
      startDate: specification.startDate,
      endDate: specification.endDate,
      categoryAliases: specification.categoryAliases,
    }),
  });

  return {
    dryRun: false,
    action: livePlan.action,
    programId,
    upstreamProgramId,
    jobId,
    verified: true,
    verification: verification.reason,
  };
}

export async function createProgramWorkflow(
  tenantId: string,
  actorId: string,
  input: unknown,
  context?: { approvedSeptemberReconciliation?: boolean },
) {
  const values = createProgramFormSchema.parse(input);
  const business = await getBusinessById(values.businessId, tenantId);

  if (
    isSeptemberCampaignLayer(values.campaignLayer) &&
    !context?.approvedSeptemberReconciliation
  ) {
    throw new YelpValidationError(
      "September campaign layers must use the audited reconciliation workflow so the protected main budget, duplicate inventory, service targeting, and Yelp read-back are verified.",
    );
  }

  if (values.programType === "CPC") {
    const allPrograms = await listPrograms(tenantId);
    const existingPrograms = allPrograms.filter(
      (program) => program.businessId === business.id,
    );
    assertNoConflictingCpcPrograms(
      existingPrograms,
      values.adCategories,
      extractYelpCategoryAliases(business.categoriesJson),
      undefined,
      values.campaignLayer,
    );
    assertMonthlyBudgetPolicy(
      allPrograms,
      parseCurrencyToCents(values.monthlyBudgetDollars ?? "0"),
    );

    if (isTemporaryAugustCampaignLayer(values.campaignLayer)) {
      const duplicateLayer = existingPrograms.find(
        (program) =>
          getProgramCampaignLayer(program.configurationJson) ===
            values.campaignLayer && isCurrentLocalProgramStatus(program.status),
      );

      if (duplicateLayer) {
        throw new YelpValidationError(
          "This approved temporary August campaign already exists for the selected business.",
        );
      }
    }
  }

  const requestPayload = mapCreateProgramFormToDto(
    values,
    business.encryptedYelpBusinessId,
  );
  const draftProgram = await createProgramRecord(tenantId, business.id, {
    type: values.programType,
    status: "QUEUED",
    currency: values.currency,
    budgetCents: requestPayload.budget ?? null,
    maxBidCents: requestPayload.max_bid ?? null,
    isAutobid: values.isAutobid,
    pacingMethod: values.pacingMethod,
    feePeriod: values.feePeriod,
    adCategoriesJson: values.adCategories,
    configurationJson: values,
    startDate: values.startDate ? new Date(values.startDate) : null,
    endDate: values.endDate ? new Date(values.endDate) : null,
  });

  const correlationId = randomUUID();

  const job = await createProgramJob(tenantId, business.id, {
    programId: draftProgram.id,
    type: "CREATE_PROGRAM",
    status: "QUEUED",
    correlationId,
    requestJson: toJsonValue(requestPayload),
  });

  try {
    const capabilities = await getCapabilityFlags(tenantId);

    if (capabilities.demoModeEnabled && !capabilities.adsApiEnabled) {
      await updateProgramJob(job.id, {
        status: "COMPLETED",
        responseJson: toJsonValue({
          job_id: `demo-${job.id}`,
          status: "COMPLETED",
        }),
        completedAt: new Date(),
      });
      await updateProgramRecord(draftProgram.id, tenantId, {
        status: "ACTIVE",
      });

      await recordAuditEvent({
        tenantId,
        actorId,
        businessId: business.id,
        programId: draftProgram.id,
        actionType: "program.create",
        status: "SUCCESS",
        correlationId,
        requestSummary: toJsonValue(requestPayload),
        responseSummary: toJsonValue({ mode: "demo" }),
        after: draftProgram as never,
      });

      return { programId: draftProgram.id, jobId: job.id };
    }

    const { credential } = await ensureYelpAccess({
      tenantId,
      capabilityKey: "adsApiEnabled",
      credentialKind: "ADS_BASIC_AUTH",
    });
    const client = new YelpAdsClient(credential);
    const response = await client.createProgram(requestPayload);
    const mapped = mapSubmittedYelpJob(response.data);

    await updateProgramJob(job.id, {
      upstreamJobId: response.data.job_id,
      status: mapped.jobStatus,
      responseJson: toJsonValue(response.data),
      completedAt: null,
    });

    await recordAuditEvent({
      tenantId,
      actorId,
      businessId: business.id,
      programId: draftProgram.id,
      actionType: "program.create",
      status: "SUCCESS",
      correlationId: response.correlationId,
      upstreamReference: response.data.job_id,
      requestSummary: toJsonValue(requestPayload),
      responseSummary: toJsonValue(response.data),
      after: {
        ...draftProgram,
        status: mapped.programStatus,
      } as never,
    });

    return { programId: draftProgram.id, jobId: job.id };
  } catch (error) {
    const normalized = normalizeUnknownError(error);

    await updateProgramJob(job.id, {
      status: "FAILED",
      errorJson: normalized.details as never,
      completedAt: new Date(),
    });
    await updateProgramRecord(draftProgram.id, tenantId, {
      status: "FAILED",
    });

    await recordAuditEvent({
      tenantId,
      actorId,
      businessId: business.id,
      programId: draftProgram.id,
      actionType: "program.create",
      status: "FAILED",
      correlationId,
      requestSummary: toJsonValue(requestPayload),
      responseSummary: toJsonValue({ message: normalized.message }),
      rawPayloadSummary: normalized.details as never,
    });

    throw normalized;
  }
}

export async function editProgramWorkflow(
  tenantId: string,
  actorId: string,
  input: unknown,
  context?: { approvedSeptemberReconciliation?: boolean },
) {
  const values = editProgramFormSchema.parse(input);

  if (
    isSeptemberCampaignLayer(values.campaignLayer) &&
    !context?.approvedSeptemberReconciliation
  ) {
    throw new YelpValidationError(
      "September campaign layers must use the audited reconciliation workflow so the protected main budget, duplicate inventory, service targeting, and Yelp read-back are verified.",
    );
  }

  const program = await getProgramById(values.programId, tenantId);
  const upstreamProgramId = assertProgramCanBeMutated(
    program,
    "editing this program",
  );
  const business = await getBusinessById(program.businessId, tenantId);
  const mappedRequest = mapEditProgramFormToDto(values);
  const requestedCategories = normalizeProgramCategoryAliases(
    values.adCategories,
  );
  const categoriesChanged = !sameNormalizedAliases(
    requestedCategories,
    program.adCategoriesJson,
  );
  const campaignLayerChanged =
    values.campaignLayer !== getProgramCampaignLayer(program.configurationJson);

  if (
    values.programType === "CPC" &&
    (categoriesChanged || campaignLayerChanged)
  ) {
    if (requestedCategories.length === 0) {
      throw new YelpValidationError(
        "Clearing categories on an existing Yelp program is ambiguous because an empty query is omitted. Use the focused category-targeting operation and select explicit listing categories.",
      );
    }

    const existingPrograms = await listPrograms(tenantId, business.id);
    assertNoConflictingCpcPrograms(
      existingPrograms,
      requestedCategories,
      extractYelpCategoryAliases(business.categoriesJson),
      program.id,
      values.campaignLayer,
    );
  }

  if (
    values.programType === "CPC" &&
    typeof mappedRequest.budget === "number"
  ) {
    assertMonthlyBudgetPolicy(
      await listPrograms(tenantId),
      mappedRequest.budget,
      program.id,
    );
  }

  const currentStartDate = program.startDate
    ? program.startDate.toISOString().slice(0, 10)
    : undefined;
  const currentEndDate = program.endDate
    ? program.endDate.toISOString().slice(0, 10)
    : undefined;
  const requestPayload = {
    ...(program.status !== "ACTIVE" &&
    mappedRequest.start &&
    mappedRequest.start !== currentStartDate
      ? { start: mappedRequest.start }
      : {}),
    ...(mappedRequest.end && mappedRequest.end !== currentEndDate
      ? { end: mappedRequest.end }
      : {}),
    ...(mappedRequest.budget != null &&
    mappedRequest.budget !== program.budgetCents
      ? { budget: mappedRequest.budget }
      : {}),
    ...(mappedRequest.future_budget_date
      ? { future_budget_date: mappedRequest.future_budget_date }
      : {}),
    ...(mappedRequest.max_bid != null &&
    mappedRequest.max_bid !== program.maxBidCents
      ? { max_bid: mappedRequest.max_bid }
      : {}),
    ...(mappedRequest.pacing_method &&
    mappedRequest.pacing_method !==
      normalizeStoredPacingMethod(program.pacingMethod)
      ? { pacing_method: mappedRequest.pacing_method }
      : {}),
    ...(categoriesChanged ? { ad_categories: requestedCategories } : {}),
  };

  if (Object.keys(requestPayload).length === 0) {
    throw new YelpValidationError(
      "No upstream program fields changed. Use the focused budget or category-targeting controls for live updates.",
    );
  }

  const correlationId = randomUUID();

  const job = await createProgramJob(tenantId, business.id, {
    programId: program.id,
    type: "EDIT_PROGRAM",
    status: "QUEUED",
    correlationId,
    requestJson: toJsonValue({
      ...requestPayload,
      _campaignLayer: values.campaignLayer,
    }),
  });

  try {
    const { credential } = await ensureYelpAccess({
      tenantId,
      capabilityKey: "adsApiEnabled",
      credentialKind: "ADS_BASIC_AUTH",
    });
    const client = new YelpAdsClient(credential);
    const response = await client.editProgram(
      upstreamProgramId,
      requestPayload,
    );
    const mapped = mapSubmittedYelpJob(response.data);

    await updateProgramJob(job.id, {
      upstreamJobId: response.data.job_id,
      status: mapped.jobStatus,
      responseJson: toJsonValue(response.data),
      completedAt: null,
    });

    await updateProgramRecord(program.id, tenantId, {
      status: mapped.programStatus,
    });

    await recordAuditEvent({
      tenantId,
      actorId,
      businessId: business.id,
      programId: program.id,
      actionType: "program.edit",
      status: "SUCCESS",
      correlationId: response.correlationId,
      upstreamReference: response.data.job_id,
      requestSummary: toJsonValue(requestPayload),
      responseSummary: toJsonValue(response.data),
      before: program.configurationJson as never,
      after: values as never,
    });

    return { programId: program.id, jobId: job.id };
  } catch (error) {
    const normalized = normalizeUnknownError(error);

    await updateProgramJob(job.id, {
      status: "FAILED",
      errorJson: normalized.details as never,
      completedAt: new Date(),
    });

    await recordAuditEvent({
      tenantId,
      actorId,
      businessId: business.id,
      programId: program.id,
      actionType: "program.edit",
      status: "FAILED",
      requestSummary: toJsonValue(requestPayload),
      responseSummary: toJsonValue({ message: normalized.message }),
      rawPayloadSummary: normalized.details as never,
    });

    throw normalized;
  }
}

export async function terminateProgramWorkflow(
  tenantId: string,
  actorId: string,
  input: unknown,
) {
  const values = terminateProgramFormSchema.parse(input);
  const program = await getProgramById(values.programId, tenantId);
  const requestPayload = mapTerminateProgramFormToDto(values);
  const correlationId = randomUUID();
  const capabilities = await getCapabilityFlags(tenantId);
  const upstreamProgramId = isDemoAdsMode(capabilities)
    ? null
    : assertProgramCanBeTerminated(program);

  const job = await createProgramJob(tenantId, program.businessId, {
    programId: program.id,
    type: "END_PROGRAM",
    status: "QUEUED",
    correlationId,
    requestJson: toJsonValue(requestPayload),
  });

  try {
    if (isDemoAdsMode(capabilities)) {
      await updateProgramJob(job.id, {
        status: "COMPLETED",
        responseJson: toJsonValue({
          job_id: `demo-${job.id}`,
          status: "COMPLETED",
        }),
        completedAt: new Date(),
      });

      await updateProgramRecord(program.id, tenantId, {
        status: "ENDED",
        endDate: values.endDate ? new Date(values.endDate) : new Date(),
      });

      await recordAuditEvent({
        tenantId,
        actorId,
        businessId: program.businessId,
        programId: program.id,
        actionType: "program.terminate",
        status: "SUCCESS",
        correlationId,
        upstreamReference: `demo-${job.id}`,
        requestSummary: toJsonValue(values),
        responseSummary: toJsonValue({ mode: "demo" }),
        before: program as never,
        after: {
          ...program,
          status: "ENDED",
          endDate: values.endDate ? new Date(values.endDate) : new Date(),
        } as never,
      });

      return { programId: program.id, jobId: job.id };
    }

    const { credential } = await ensureYelpAccess({
      tenantId,
      capabilityKey: "adsApiEnabled",
      credentialKind: "ADS_BASIC_AUTH",
    });
    const client = new YelpAdsClient(credential);
    const response = await client.endProgram(
      upstreamProgramId!,
      requestPayload,
    );
    const mapped = mapSubmittedYelpJob(response.data);

    await updateProgramJob(job.id, {
      upstreamJobId: response.data.job_id,
      status: mapped.jobStatus,
      responseJson: toJsonValue(response.data),
      completedAt: null,
    });

    await recordAuditEvent({
      tenantId,
      actorId,
      businessId: program.businessId,
      programId: program.id,
      actionType: "program.terminate",
      status: "SUCCESS",
      correlationId: response.correlationId,
      upstreamReference: response.data.job_id,
      requestSummary: toJsonValue(values),
      responseSummary: toJsonValue(response.data),
      before: program as never,
      after: {
        ...program,
        status: mapped.programStatus,
      } as never,
    });

    return { programId: program.id, jobId: job.id };
  } catch (error) {
    const normalized = normalizeUnknownError(error);

    await updateProgramJob(job.id, {
      status: "FAILED",
      errorJson: normalized.details as never,
      completedAt: new Date(),
    });

    await recordAuditEvent({
      tenantId,
      actorId,
      businessId: program.businessId,
      programId: program.id,
      actionType: "program.terminate",
      status: "FAILED",
      requestSummary: toJsonValue(requestPayload),
      responseSummary: toJsonValue({ message: normalized.message }),
      rawPayloadSummary: normalized.details as never,
    });

    throw normalized;
  }
}

export async function updateProgramBudgetWorkflow(
  tenantId: string,
  actorId: string,
  programId: string,
  input: unknown,
) {
  const values = programBudgetOperationSchema.parse(input);
  const program = await getProgramById(programId, tenantId);

  if (
    isSeptemberCampaignLayer(getProgramCampaignLayer(program.configurationJson))
  ) {
    throw new YelpValidationError(
      "September layer budgets are locked to the audited campaign plan.",
    );
  }

  if (program.type !== "CPC") {
    throw new YelpValidationError(
      "Budget operations are currently limited to CPC programs.",
    );
  }

  const capabilities = await getCapabilityFlags(tenantId);
  const demoMode = isDemoAdsMode(capabilities);
  const upstreamProgramId = demoMode
    ? assertProgramCanBeMutated(
        program,
        "updating budget or bid settings",
        false,
      )
    : assertProgramCanBeMutated(program, "updating budget or bid settings");

  const correlationId = randomUUID();
  let requestPayload: ReturnType<typeof mapEditProgramFormToDto> | null = null;
  let afterConfiguration: unknown = program.configurationJson;
  let actionType = "program.budget.update";

  if (values.operation === "CURRENT_BUDGET") {
    requestPayload = {
      budget: parseCurrencyToCents(values.currentBudgetDollars),
    };
    afterConfiguration = mergeConfigurationJson(program.configurationJson, {
      monthlyBudgetDollars: values.currentBudgetDollars,
    });
    actionType = "program.budget.current.update";
  }

  if (values.operation === "SCHEDULED_BUDGET") {
    requestPayload = {
      budget: parseCurrencyToCents(values.scheduledBudgetDollars),
      future_budget_date: values.scheduledBudgetEffectiveDate,
    };
    afterConfiguration = mergeConfigurationJson(program.configurationJson, {
      scheduledBudgetDollars: values.scheduledBudgetDollars,
      scheduledBudgetEffectiveDate: values.scheduledBudgetEffectiveDate,
    });
    actionType = "program.budget.schedule.update";
  }

  if (values.operation === "BID_STRATEGY") {
    if (program.isAutobid && values.maxBidDollars) {
      throw new YelpValidationError(
        "This program is currently using Yelp autobid, so max bid cannot be changed directly.",
      );
    }

    requestPayload = {
      pacing_method: values.pacingMethod,
      ...(values.maxBidDollars
        ? { max_bid: parseCurrencyToCents(values.maxBidDollars) }
        : {}),
    };
    afterConfiguration = mergeConfigurationJson(program.configurationJson, {
      pacingMethod: values.pacingMethod,
      ...(values.maxBidDollars ? { maxBidDollars: values.maxBidDollars } : {}),
    });
    actionType = "program.bid-strategy.update";
  }

  if (typeof requestPayload?.budget === "number") {
    const programs = await listPrograms(tenantId);
    assertMonthlyBudgetPolicy(programs, requestPayload.budget, program.id);
  }

  const job = await createProgramJob(tenantId, program.businessId, {
    programId: program.id,
    type: "EDIT_PROGRAM",
    status: "QUEUED",
    correlationId,
    requestJson: toJsonValue({
      ...requestPayload,
      _operation: values.operation,
      _internalNote: values.internalNote,
    }),
  });

  try {
    if (demoMode) {
      await updateProgramJob(job.id, {
        status: "COMPLETED",
        responseJson: toJsonValue({
          job_id: `demo-${job.id}`,
          status: "COMPLETED",
        }),
        completedAt: new Date(),
      });
      await updateProgramRecord(program.id, tenantId, {
        configurationJson: toJsonValue(afterConfiguration),
        ...(values.operation === "CURRENT_BUDGET"
          ? { budgetCents: requestPayload?.budget }
          : {}),
        ...(values.operation === "BID_STRATEGY"
          ? {
              pacingMethod: values.pacingMethod,
              ...(typeof requestPayload?.max_bid === "number"
                ? { maxBidCents: requestPayload.max_bid }
                : {}),
            }
          : {}),
      });
      await recordAuditEvent({
        tenantId,
        actorId,
        businessId: program.businessId,
        programId: program.id,
        actionType,
        status: "SUCCESS",
        correlationId,
        upstreamReference: `demo-${job.id}`,
        requestSummary: toJsonValue({
          operation: values.operation,
          payload: requestPayload,
          internalNote: values.internalNote,
        }),
        responseSummary: toJsonValue({ mode: "demo" }),
        before: program.configurationJson as never,
        after: afterConfiguration as never,
      });

      return { programId: program.id, jobId: job.id };
    }

    const { credential } = await ensureYelpAccess({
      tenantId,
      capabilityKey: "adsApiEnabled",
      credentialKind: "ADS_BASIC_AUTH",
    });
    const client = new YelpAdsClient(credential);
    const response = await client.editProgram(
      upstreamProgramId!,
      requestPayload!,
    );

    await updateProgramJob(job.id, {
      upstreamJobId: response.data.job_id,
      status: "QUEUED",
      responseJson: toJsonValue(response.data),
    });

    await recordAuditEvent({
      tenantId,
      actorId,
      businessId: program.businessId,
      programId: program.id,
      actionType,
      status: "SUCCESS",
      correlationId: response.correlationId,
      upstreamReference: response.data.job_id,
      requestSummary: toJsonValue({
        operation: values.operation,
        payload: requestPayload,
        internalNote: values.internalNote,
      }),
      responseSummary: toJsonValue(response.data),
      before: program.configurationJson as never,
      after: afterConfiguration as never,
    });

    return { programId: program.id, jobId: job.id };
  } catch (error) {
    const normalized = normalizeUnknownError(error);

    await updateProgramJob(job.id, {
      status: "FAILED",
      errorJson: normalized.details as never,
      completedAt: new Date(),
    });

    await recordAuditEvent({
      tenantId,
      actorId,
      businessId: program.businessId,
      programId: program.id,
      actionType,
      status: "FAILED",
      correlationId,
      requestSummary: toJsonValue({
        operation: values.operation,
        payload: requestPayload,
        internalNote: values.internalNote,
      }),
      responseSummary: toJsonValue({ message: normalized.message }),
      rawPayloadSummary: normalized.details as never,
    });

    throw normalized;
  }
}

export async function updateProgramCategoryTargetingWorkflow(
  tenantId: string,
  actorId: string,
  programId: string,
  input: unknown,
) {
  const values = programCategoryTargetingOperationSchema.parse(input);
  const program = await getProgramById(programId, tenantId);
  const currentCampaignLayer = getProgramCampaignLayer(
    program.configurationJson,
  );

  if (isSeptemberCampaignLayer(currentCampaignLayer)) {
    throw new YelpValidationError(
      "September layer category targeting is locked to the audited campaign plan.",
    );
  }

  if (program.type !== "CPC") {
    throw new YelpValidationError(
      "Category targeting operations are available for CPC programs only.",
    );
  }

  if (values.campaignLayer !== currentCampaignLayer) {
    throw new YelpValidationError(
      "Campaign layers are fixed after creation. Create an approved separate layer instead of relabeling a live campaign.",
    );
  }

  const upstreamProgramId = assertProgramCanBeMutated(
    program,
    "updating category targeting",
  );

  const listingAliases = extractYelpCategoryAliases(
    program.business.categoriesJson,
  );
  const requestedAliases = normalizeProgramCategoryAliases(values.adCategories);
  const unknownAliases = requestedAliases.filter(
    (alias) => !listingAliases.includes(alias),
  );

  if (listingAliases.length === 0) {
    throw new YelpValidationError(
      "This business has no saved Yelp category aliases. Sync or correct the business listing before changing campaign targeting.",
    );
  }

  if (unknownAliases.length > 0) {
    throw new YelpValidationError(
      `These categories are not present on the saved Yelp business listing: ${unknownAliases.join(", ")}.`,
    );
  }

  const existingPrograms = await listPrograms(tenantId, program.businessId);
  assertNoConflictingCpcPrograms(
    existingPrograms,
    requestedAliases,
    listingAliases,
    program.id,
    values.campaignLayer,
  );

  const correlationId = randomUUID();
  const requestPayload = {
    ad_categories: requestedAliases,
  };
  const afterConfiguration = mergeConfigurationJson(program.configurationJson, {
    adCategories: requestedAliases,
    campaignLayer: values.campaignLayer,
    categoryTargetingUpdatedAt: new Date().toISOString(),
    categoryTargetingInternalNote: values.internalNote ?? "",
  });
  const job = await createProgramJob(tenantId, program.businessId, {
    programId: program.id,
    type: "EDIT_PROGRAM",
    status: "QUEUED",
    correlationId,
    requestJson: toJsonValue({
      ...requestPayload,
      _operation: "CATEGORY_TARGETING",
      _campaignLayer: values.campaignLayer,
      _internalNote: values.internalNote ?? "",
    }),
  });

  try {
    const { credential } = await ensureYelpAccess({
      tenantId,
      capabilityKey: "adsApiEnabled",
      credentialKind: "ADS_BASIC_AUTH",
    });
    const client = new YelpAdsClient(credential);
    const response = await client.editProgram(
      upstreamProgramId,
      requestPayload,
    );

    await updateProgramJob(job.id, {
      upstreamJobId: response.data.job_id,
      status: "QUEUED",
      responseJson: toJsonValue(response.data),
    });

    await recordAuditEvent({
      tenantId,
      actorId,
      businessId: program.businessId,
      programId: program.id,
      actionType: "program.category-targeting.update",
      status: "SUCCESS",
      correlationId: response.correlationId,
      upstreamReference: response.data.job_id,
      requestSummary: toJsonValue({
        operation: "CATEGORY_TARGETING",
        payload: requestPayload,
        internalNote: values.internalNote ?? "",
      }),
      responseSummary: toJsonValue(response.data),
      before: program.configurationJson as never,
      after: afterConfiguration as never,
    });

    return { programId: program.id, jobId: job.id };
  } catch (error) {
    const normalized = normalizeUnknownError(error);

    await updateProgramJob(job.id, {
      status: "FAILED",
      errorJson: normalized.details as never,
      completedAt: new Date(),
    });

    await recordAuditEvent({
      tenantId,
      actorId,
      businessId: program.businessId,
      programId: program.id,
      actionType: "program.category-targeting.update",
      status: "FAILED",
      correlationId,
      requestSummary: toJsonValue({
        operation: "CATEGORY_TARGETING",
        payload: requestPayload,
        internalNote: values.internalNote ?? "",
      }),
      responseSummary: toJsonValue({ message: normalized.message }),
      rawPayloadSummary: normalized.details as never,
    });

    throw normalized;
  }
}

export async function pollProgramJobWorkflow(tenantId: string, jobId: string) {
  const job = await getProgramJob(jobId, tenantId);
  const capabilities = await getCapabilityFlags(tenantId);
  const shouldRetryFailedPoll =
    job.status === "FAILED" &&
    job.upstreamJobId &&
    isRetryableStatusPollFailure(job.errorJson);

  if (
    !shouldRetryFailedPoll &&
    (job.completedAt ||
      job.status === "COMPLETED" ||
      job.status === "PARTIAL" ||
      job.status === "FAILED")
  ) {
    return job;
  }

  if (capabilities.demoModeEnabled && !capabilities.adsApiEnabled) {
    return getProgramJob(jobId, tenantId);
  }

  if (!job.upstreamJobId) {
    throw new YelpMissingAccessError(
      "The selected job does not have an upstream job ID yet.",
    );
  }

  try {
    const { credential } = await ensureYelpAccess({
      tenantId,
      capabilityKey: "adsApiEnabled",
      credentialKind: "ADS_BASIC_AUTH",
    });
    const client = new YelpAdsClient(credential);

    const result = await pollUntil({
      attempts: 5,
      onExhausted: "return-last",
      getValue: async () => {
        const response = await client.getJobStatus(job.upstreamJobId!);
        const mapped = mapYelpJobStatusReceipt(
          response.data,
          job.type === "CREATE_PROGRAM"
            ? "CREATE_PROGRAM"
            : job.type === "EDIT_PROGRAM"
              ? "EDIT_PROGRAM"
              : "END_PROGRAM",
          job.program?.startDate
            ? job.program.startDate.toISOString().slice(0, 10)
            : undefined,
        );
        const issue = summarizeYelpJobIssue(response.data);

        await updateProgramJob(job.id, {
          status: mapped.jobStatus,
          responseJson: toJsonValue(response.data),
          errorJson: issue ? toJsonValue(issue) : undefined,
          lastPolledAt: new Date(),
          completedAt: mapped.isTerminal ? new Date() : null,
        });

        if (issue?.code === "UNSUPPORTED_CATEGORIES") {
          await updateBusinessRecord(job.businessId, tenantId, {
            readinessJson: mergeBusinessReadinessJson(
              job.business?.readinessJson,
              {
                adsEligibilityBlocked: true,
                adsEligibilityStatus: "INELIGIBLE",
                adsEligibilityCode: issue.code,
                adsEligibilityMessage: issue.rawMessage ?? issue.description,
                adsEligibilityDetectedAt: new Date().toISOString(),
              },
            ),
          });
        } else if (mapped.jobStatus === "COMPLETED") {
          await updateBusinessRecord(job.businessId, tenantId, {
            readinessJson: mergeBusinessReadinessJson(
              job.business?.readinessJson,
              {
                adsEligibilityBlocked: false,
                adsEligibilityStatus: "ELIGIBLE",
                adsEligibilityCode: null,
                adsEligibilityMessage: null,
                adsEligibilityDetectedAt: new Date().toISOString(),
              },
            ),
          });
        }

        if (job.programId) {
          const derivedProgramPatch = mapped.isTerminal
            ? deriveProgramUpdateFromEditRequest(
                job.requestJson,
                job.program?.configurationJson,
              )
            : {};

          await updateProgramRecord(job.programId, tenantId, {
            status: mapped.programStatus,
            upstreamProgramId: mapped.upstreamProgramId ?? undefined,
            ...(mapped.programStatus === "ENDED"
              ? { endDate: new Date() }
              : {}),
            ...(job.type === "EDIT_PROGRAM" ? derivedProgramPatch : {}),
          });
        }

        return {
          ...response.data,
          mapped,
        };
      },
      isComplete: (value) => value.mapped.isTerminal,
    });

    void result;
    return getProgramJob(jobId, tenantId);
  } catch (error) {
    const normalized = normalizeUnknownError(error);

    await updateProgramJob(job.id, {
      // A failed status lookup does not mean Yelp rejected the underlying
      // mutation. Keep the job reconcilable and preserve the live program.
      status: "PROCESSING",
      errorJson: toJsonValue({
        source: "status_poll",
        code: normalized.code,
        message: normalized.message,
        details: normalized.details ?? null,
      }),
      lastPolledAt: new Date(),
      completedAt: null,
    });

    return getProgramJob(jobId, tenantId);
  }
}

export async function reconcilePendingProgramJobs(limit = 25) {
  const jobs = await listPendingProgramJobs(limit);
  const results = [];

  for (const job of jobs) {
    try {
      const reconciled = await pollProgramJobWorkflow(job.tenantId, job.id);
      results.push({
        jobId: job.id,
        tenantId: job.tenantId,
        status: reconciled.status,
      });
    } catch (error) {
      const normalized = normalizeUnknownError(error);
      results.push({
        jobId: job.id,
        tenantId: job.tenantId,
        status: "FAILED",
        code: normalized.code,
        message: normalized.message,
      });
    }
  }

  return results;
}
