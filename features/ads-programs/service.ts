import "server-only";

import { randomUUID } from "node:crypto";

import {
  createProgramFormSchema,
  editProgramFormSchema,
  programBudgetOperationSchema,
  terminateProgramFormSchema
} from "@/features/ads-programs/schemas";
import { recordAuditEvent } from "@/features/audit/service";
import { getBusinessById } from "@/lib/db/businesses-repository";
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
  updateProgramRecord
} from "@/lib/db/programs-repository";
import {
  mapCreateProgramFormToDto,
  mapEditProgramFormToDto,
  mapSubmittedYelpJob,
  mapTerminateProgramFormToDto,
  mapYelpJobStatusReceipt
} from "@/lib/yelp/mappers";
import { ensureYelpAccess, getCapabilityFlags } from "@/lib/yelp/runtime";
import { YelpAdsClient } from "@/lib/yelp/ads-client";
import {
  normalizeUnknownError,
  YelpMissingAccessError,
  YelpValidationError
} from "@/lib/yelp/errors";
import { summarizeYelpJobIssue } from "@/lib/yelp/job-status";
import { parseCurrencyToCents } from "@/lib/utils/format";
import { pollUntil } from "@/lib/utils/polling";

function mergeConfigurationJson(existing: unknown, patch: Record<string, unknown>) {
  const current = typeof existing === "object" && existing !== null ? (existing as Record<string, unknown>) : {};
  return {
    ...current,
    ...patch
  };
}

function deriveProgramUpdateFromEditRequest(requestJson: unknown, currentConfigurationJson: unknown) {
  const request = typeof requestJson === "object" && requestJson !== null ? (requestJson as Record<string, unknown>) : {};
  const nextConfiguration = mergeConfigurationJson(currentConfigurationJson, {
    ...(typeof request.start === "string" ? { startDate: request.start } : {}),
    ...(typeof request.budget === "number" && typeof request.future_budget_date !== "string"
      ? { monthlyBudgetDollars: String(request.budget / 100) }
      : {}),
    ...(typeof request.future_budget_date === "string" && typeof request.budget === "number"
      ? {
          scheduledBudgetEffectiveDate: request.future_budget_date,
          scheduledBudgetDollars: String(request.budget / 100)
        }
      : {}),
    ...(typeof request.max_bid === "number" ? { maxBidDollars: String(request.max_bid / 100) } : {}),
    ...(typeof request.pacing_method === "string" ? { pacingMethod: request.pacing_method } : {}),
    ...(Array.isArray(request.ad_categories) ? { adCategories: request.ad_categories } : {})
  });

  return {
    ...(typeof request.start === "string" ? { startDate: new Date(request.start) } : {}),
    ...(typeof request.end === "string" ? { endDate: new Date(request.end) } : {}),
    ...(typeof request.budget === "number" && typeof request.future_budget_date !== "string" ? { budgetCents: request.budget } : {}),
    ...(typeof request.max_bid === "number" ? { maxBidCents: request.max_bid } : {}),
    ...(typeof request.pacing_method === "string" ? { pacingMethod: request.pacing_method } : {}),
    ...(Array.isArray(request.ad_categories) ? { adCategoriesJson: request.ad_categories } : {}),
    configurationJson: nextConfiguration
  };
}

function isRetryableStatusPollFailure(errorJson: unknown) {
  return typeof errorJson === "object" && errorJson !== null && (errorJson as { source?: unknown }).source === "status_poll";
}

function mergeBusinessReadinessJson(existing: unknown, patch: Record<string, unknown>) {
  const current = typeof existing === "object" && existing !== null ? (existing as Record<string, unknown>) : {};
  return {
    ...current,
    ...patch
  };
}

function isDemoAdsMode(capabilities: Awaited<ReturnType<typeof getCapabilityFlags>>) {
  return capabilities.demoModeEnabled && !capabilities.adsApiEnabled;
}

function assertProgramCanBeTerminated(program: Awaited<ReturnType<typeof getProgramById>>) {
  if (program.status === "ENDED") {
    throw new YelpValidationError("This program is already ended.");
  }

  if (program.status === "QUEUED" || program.status === "PROCESSING") {
    throw new YelpValidationError("Wait for the current Yelp job to finish before submitting termination.");
  }

  if (!program.upstreamProgramId) {
    throw new YelpValidationError(
      "This program has no confirmed Yelp program ID yet. Its create job never completed successfully on Yelp, so there is nothing upstream to terminate."
    );
  }

  return program.upstreamProgramId;
}

function assertProgramCanBeMutated(program: Awaited<ReturnType<typeof getProgramById>>, actionLabel: string) {
  if (program.status === "ENDED") {
    throw new YelpValidationError(`This program is already ended and cannot be used for ${actionLabel}.`);
  }

  if (program.status === "QUEUED" || program.status === "PROCESSING") {
    throw new YelpValidationError(`Wait for the current Yelp job to finish before ${actionLabel}.`);
  }

  if (!program.upstreamProgramId) {
    throw new YelpValidationError(
      `This program has no confirmed Yelp program ID yet. Its create job never completed successfully on Yelp, so ${actionLabel} is not possible upstream.`
    );
  }

  return program.upstreamProgramId;
}

export async function getProgramsIndex(tenantId: string) {
  return listPrograms(tenantId);
}

export async function getProgramDetail(tenantId: string, programId: string) {
  return getProgramById(programId, tenantId);
}

export async function createProgramWorkflow(tenantId: string, actorId: string, input: unknown) {
  const values = createProgramFormSchema.parse(input);
  const business = await getBusinessById(values.businessId, tenantId);
  const requestPayload = mapCreateProgramFormToDto(values, business.encryptedYelpBusinessId);
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
    startDate: values.startDate ? new Date(values.startDate) : null
  });

  const correlationId = randomUUID();

  const job = await createProgramJob(tenantId, business.id, {
    programId: draftProgram.id,
    type: "CREATE_PROGRAM",
    status: "QUEUED",
    correlationId,
    requestJson: toJsonValue(requestPayload)
  });

  try {
    const capabilities = await getCapabilityFlags(tenantId);

    if (capabilities.demoModeEnabled && !capabilities.adsApiEnabled) {
      await updateProgramJob(job.id, {
        status: "COMPLETED",
        responseJson: toJsonValue({
          job_id: `demo-${job.id}`,
          status: "COMPLETED"
        }),
        completedAt: new Date()
      });
      await updateProgramRecord(draftProgram.id, tenantId, { status: "ACTIVE" });

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
        after: draftProgram as never
      });

      return { programId: draftProgram.id, jobId: job.id };
    }

    const { credential } = await ensureYelpAccess({
      tenantId,
      capabilityKey: "adsApiEnabled",
      credentialKind: "ADS_BASIC_AUTH"
    });
    const client = new YelpAdsClient(credential);
    const response = await client.createProgram(requestPayload);
    const mapped = mapSubmittedYelpJob(response.data);

    await updateProgramJob(job.id, {
      upstreamJobId: response.data.job_id,
      status: mapped.jobStatus,
      responseJson: toJsonValue(response.data),
      completedAt: null
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
        status: mapped.programStatus
      } as never
    });

    return { programId: draftProgram.id, jobId: job.id };
  } catch (error) {
    const normalized = normalizeUnknownError(error);

    await updateProgramJob(job.id, {
      status: "FAILED",
      errorJson: normalized.details as never,
      completedAt: new Date()
    });
    await updateProgramRecord(draftProgram.id, tenantId, {
      status: "FAILED"
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
      rawPayloadSummary: normalized.details as never
    });

    throw normalized;
  }
}

export async function editProgramWorkflow(tenantId: string, actorId: string, input: unknown) {
  const values = editProgramFormSchema.parse(input);
  const program = await getProgramById(values.programId, tenantId);
  const business = await getBusinessById(program.businessId, tenantId);
  const requestPayload = mapEditProgramFormToDto(values);
  const correlationId = randomUUID();

  const job = await createProgramJob(tenantId, business.id, {
    programId: program.id,
    type: "EDIT_PROGRAM",
    status: "QUEUED",
    correlationId,
    requestJson: toJsonValue(requestPayload)
  });

  try {
    const upstreamProgramId = assertProgramCanBeMutated(program, "editing this program");
    const { credential } = await ensureYelpAccess({
      tenantId,
      capabilityKey: "adsApiEnabled",
      credentialKind: "ADS_BASIC_AUTH"
    });
    const client = new YelpAdsClient(credential);
    const response = await client.editProgram(upstreamProgramId, requestPayload);
    const mapped = mapSubmittedYelpJob(response.data);

    await updateProgramJob(job.id, {
      upstreamJobId: response.data.job_id,
      status: mapped.jobStatus,
      responseJson: toJsonValue(response.data),
      completedAt: null
    });

    await updateProgramRecord(program.id, tenantId, {
      status: mapped.programStatus
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
      after: values as never
    });

    return { programId: program.id, jobId: job.id };
  } catch (error) {
    const normalized = normalizeUnknownError(error);

    await updateProgramJob(job.id, {
      status: "FAILED",
      errorJson: normalized.details as never,
      completedAt: new Date()
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
      rawPayloadSummary: normalized.details as never
    });

    throw normalized;
  }
}

export async function terminateProgramWorkflow(tenantId: string, actorId: string, input: unknown) {
  const values = terminateProgramFormSchema.parse(input);
  const program = await getProgramById(values.programId, tenantId);
  const requestPayload = mapTerminateProgramFormToDto(values);
  const correlationId = randomUUID();

  const job = await createProgramJob(tenantId, program.businessId, {
    programId: program.id,
    type: "END_PROGRAM",
    status: "QUEUED",
    correlationId,
    requestJson: toJsonValue(requestPayload)
  });

  try {
    const capabilities = await getCapabilityFlags(tenantId);

    if (isDemoAdsMode(capabilities)) {
      await updateProgramJob(job.id, {
        status: "COMPLETED",
        responseJson: toJsonValue({
          job_id: `demo-${job.id}`,
          status: "COMPLETED"
        }),
        completedAt: new Date()
      });

      await updateProgramRecord(program.id, tenantId, {
        status: "ENDED",
        endDate: values.endDate ? new Date(values.endDate) : new Date()
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
          endDate: values.endDate ? new Date(values.endDate) : new Date()
        } as never
      });

      return { programId: program.id, jobId: job.id };
    }

    const upstreamProgramId = assertProgramCanBeTerminated(program);
    const { credential } = await ensureYelpAccess({
      tenantId,
      capabilityKey: "adsApiEnabled",
      credentialKind: "ADS_BASIC_AUTH"
    });
    const client = new YelpAdsClient(credential);
    const response = await client.endProgram(upstreamProgramId, requestPayload);
    const mapped = mapSubmittedYelpJob(response.data);

    await updateProgramJob(job.id, {
      upstreamJobId: response.data.job_id,
      status: mapped.jobStatus,
      responseJson: toJsonValue(response.data),
      completedAt: null
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
        status: mapped.programStatus
      } as never
    });

    return { programId: program.id, jobId: job.id };
  } catch (error) {
    const normalized = normalizeUnknownError(error);

    await updateProgramJob(job.id, {
      status: "FAILED",
      errorJson: normalized.details as never,
      completedAt: new Date()
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
      rawPayloadSummary: normalized.details as never
    });

    throw normalized;
  }
}

export async function updateProgramBudgetWorkflow(tenantId: string, actorId: string, programId: string, input: unknown) {
  const values = programBudgetOperationSchema.parse(input);
  const program = await getProgramById(programId, tenantId);

  if (program.type !== "CPC") {
    throw new YelpValidationError("Budget operations are currently limited to CPC programs.");
  }

  const correlationId = randomUUID();
  let requestPayload: ReturnType<typeof mapEditProgramFormToDto> | null = null;
  let afterConfiguration: unknown = program.configurationJson;
  let actionType = "program.budget.update";

  if (values.operation === "CURRENT_BUDGET") {
    requestPayload = {
      budget: parseCurrencyToCents(values.currentBudgetDollars)
    };
    afterConfiguration = mergeConfigurationJson(program.configurationJson, {
      monthlyBudgetDollars: values.currentBudgetDollars
    });
    actionType = "program.budget.current.update";
  }

  if (values.operation === "SCHEDULED_BUDGET") {
    requestPayload = {
      budget: parseCurrencyToCents(values.scheduledBudgetDollars),
      future_budget_date: values.scheduledBudgetEffectiveDate
    };
    afterConfiguration = mergeConfigurationJson(program.configurationJson, {
      scheduledBudgetDollars: values.scheduledBudgetDollars,
      scheduledBudgetEffectiveDate: values.scheduledBudgetEffectiveDate
    });
    actionType = "program.budget.schedule.update";
  }

  if (values.operation === "BID_STRATEGY") {
    if (program.isAutobid && values.maxBidDollars) {
      throw new YelpValidationError("This program is currently using Yelp autobid, so max bid cannot be changed directly.");
    }

    requestPayload = {
      pacing_method: values.pacingMethod,
      ...(values.maxBidDollars ? { max_bid: parseCurrencyToCents(values.maxBidDollars) } : {})
    };
    afterConfiguration = mergeConfigurationJson(program.configurationJson, {
      pacingMethod: values.pacingMethod,
      ...(values.maxBidDollars ? { maxBidDollars: values.maxBidDollars } : {})
    });
    actionType = "program.bid-strategy.update";
  }

  const job = await createProgramJob(tenantId, program.businessId, {
    programId: program.id,
    type: "EDIT_PROGRAM",
    status: "QUEUED",
    correlationId,
    requestJson: toJsonValue({
      ...requestPayload,
      _operation: values.operation,
      _internalNote: values.internalNote
    })
  });

  try {
    const upstreamProgramId = assertProgramCanBeMutated(program, "updating budget or bid settings");
    const { credential } = await ensureYelpAccess({
      tenantId,
      capabilityKey: "adsApiEnabled",
      credentialKind: "ADS_BASIC_AUTH"
    });
    const client = new YelpAdsClient(credential);
    const response = await client.editProgram(upstreamProgramId, requestPayload!);

    await updateProgramJob(job.id, {
      upstreamJobId: response.data.job_id,
      status: "QUEUED",
      responseJson: toJsonValue(response.data)
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
        internalNote: values.internalNote
      }),
      responseSummary: toJsonValue(response.data),
      before: program.configurationJson as never,
      after: afterConfiguration as never
    });

    return { programId: program.id, jobId: job.id };
  } catch (error) {
    const normalized = normalizeUnknownError(error);

    await updateProgramJob(job.id, {
      status: "FAILED",
      errorJson: normalized.details as never,
      completedAt: new Date()
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
        internalNote: values.internalNote
      }),
      responseSummary: toJsonValue({ message: normalized.message }),
      rawPayloadSummary: normalized.details as never
    });

    throw normalized;
  }
}

export async function pollProgramJobWorkflow(tenantId: string, jobId: string) {
  const job = await getProgramJob(jobId, tenantId);
  const capabilities = await getCapabilityFlags(tenantId);
  const shouldRetryFailedPoll = job.status === "FAILED" && job.upstreamJobId && isRetryableStatusPollFailure(job.errorJson);

  if (!shouldRetryFailedPoll && (job.completedAt || job.status === "COMPLETED" || job.status === "PARTIAL" || job.status === "FAILED")) {
    return job;
  }

  if (capabilities.demoModeEnabled && !capabilities.adsApiEnabled) {
    return getProgramJob(jobId, tenantId);
  }

  if (!job.upstreamJobId) {
    throw new YelpMissingAccessError("The selected job does not have an upstream job ID yet.");
  }

  try {
    const { credential } = await ensureYelpAccess({
      tenantId,
      capabilityKey: "adsApiEnabled",
      credentialKind: "ADS_BASIC_AUTH"
    });
    const client = new YelpAdsClient(credential);

    const result = await pollUntil({
      attempts: 5,
      onExhausted: "return-last",
      getValue: async () => {
        const response = await client.getJobStatus(job.upstreamJobId!);
        const mapped = mapYelpJobStatusReceipt(
          response.data,
          job.type === "CREATE_PROGRAM" ? "CREATE_PROGRAM" : job.type === "EDIT_PROGRAM" ? "EDIT_PROGRAM" : "END_PROGRAM",
          job.program?.startDate ? job.program.startDate.toISOString().slice(0, 10) : undefined
        );
        const issue = summarizeYelpJobIssue(response.data);

        await updateProgramJob(job.id, {
          status: mapped.jobStatus,
          responseJson: toJsonValue(response.data),
          errorJson: issue ? toJsonValue(issue) : undefined,
          lastPolledAt: new Date(),
          completedAt: mapped.isTerminal ? new Date() : null
        });

        if (issue?.code === "UNSUPPORTED_CATEGORIES") {
          await updateBusinessRecord(job.businessId, tenantId, {
            readinessJson: mergeBusinessReadinessJson(job.business?.readinessJson, {
              adsEligibilityBlocked: true,
              adsEligibilityStatus: "INELIGIBLE",
              adsEligibilityCode: issue.code,
              adsEligibilityMessage: issue.rawMessage ?? issue.description,
              adsEligibilityDetectedAt: new Date().toISOString()
            })
          });
        } else if (mapped.jobStatus === "COMPLETED") {
          await updateBusinessRecord(job.businessId, tenantId, {
            readinessJson: mergeBusinessReadinessJson(job.business?.readinessJson, {
              adsEligibilityBlocked: false,
              adsEligibilityStatus: "ELIGIBLE",
              adsEligibilityCode: null,
              adsEligibilityMessage: null,
              adsEligibilityDetectedAt: new Date().toISOString()
            })
          });
        }

        if (job.programId) {
          const derivedProgramPatch = mapped.isTerminal
            ? deriveProgramUpdateFromEditRequest(job.requestJson, job.program?.configurationJson)
            : {};

          await updateProgramRecord(job.programId, tenantId, {
            status: mapped.programStatus,
            upstreamProgramId: mapped.upstreamProgramId ?? undefined,
            ...(mapped.programStatus === "ENDED" ? { endDate: new Date() } : {}),
            ...(job.type === "EDIT_PROGRAM" ? derivedProgramPatch : {})
          });
        }

        return {
          ...response.data,
          mapped
        };
      },
      isComplete: (value) => value.mapped.isTerminal
    });

    void result;
    return getProgramJob(jobId, tenantId);
  } catch (error) {
    const normalized = normalizeUnknownError(error);

    await updateProgramJob(job.id, {
      status: "FAILED",
      errorJson: toJsonValue({
        source: "status_poll",
        code: normalized.code,
        message: normalized.message,
        details: normalized.details ?? null
      }),
      lastPolledAt: new Date(),
      completedAt: new Date()
    });

    if (job.programId) {
      await updateProgramRecord(job.programId, tenantId, {
        status: "FAILED"
      });
    }

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
        status: reconciled.status
      });
    } catch (error) {
      const normalized = normalizeUnknownError(error);
      results.push({
        jobId: job.id,
        tenantId: job.tenantId,
        status: "FAILED",
        code: normalized.code,
        message: normalized.message
      });
    }
  }

  return results;
}
