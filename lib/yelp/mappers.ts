import type { JobStatus, ProgramStatus } from "@prisma/client";

import type { CreateProgramFormValues, EditProgramFormValues, TerminateProgramFormValues } from "@/features/ads-programs/schemas";
import type { FeatureFormValues } from "@/features/program-features/schemas";
import type { ReportRequestFormValues } from "@/features/reporting/schemas";
import { parseCurrencyToCents } from "@/lib/utils/format";
import type {
  YelpCreateProgramRequestDto,
  YelpEditProgramRequestDto,
  YelpJobSubmissionResponseDto,
  YelpJobStatusResponseDto,
  YelpProgramFeatureDto,
  YelpReportRequestDto,
  YelpTerminateProgramRequestDto
} from "@/lib/yelp/schemas";

function toDateOnlyOrUndefined(value: string | undefined) {
  return value || undefined;
}

function hasFutureStartDate(value: string | undefined) {
  if (!value) {
    return false;
  }

  const input = new Date(`${value}T00:00:00.000Z`);
  const today = new Date();
  const todayUtc = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));

  return input.getTime() > todayUtc.getTime();
}

function collectReceiptStatuses(receipt: YelpJobStatusResponseDto) {
  const statuses = new Set<string>([receipt.status]);

  for (const businessResult of receipt.business_results ?? []) {
    statuses.add(businessResult.status);

    for (const updateGroup of Object.values(businessResult.update_results ?? {})) {
      if (typeof updateGroup.status === "string") {
        statuses.add(updateGroup.status);
      }

      for (const [key, updateResult] of Object.entries(updateGroup)) {
        if (key === "status") {
          continue;
        }

        if (typeof updateResult === "string" && updateResult.length > 0) {
          statuses.add(updateResult);
          continue;
        }

        if (typeof updateResult === "object" && updateResult !== null && "status" in updateResult) {
          const nestedStatus = (updateResult as { status?: unknown }).status;

          if (typeof nestedStatus === "string" && nestedStatus.length > 0) {
            statuses.add(nestedStatus);
          }
        }
      }
    }
  }

  return statuses;
}

function findUpstreamProgramId(receipt: YelpJobStatusResponseDto) {
  for (const businessResult of receipt.business_results ?? []) {
    if (businessResult.identifier_type === "PROGRAM" && businessResult.identifier) {
      return businessResult.identifier;
    }

    for (const updateGroup of Object.values(businessResult.update_results ?? {})) {
      const programIdValue =
        typeof updateGroup === "object" && updateGroup !== null && "program_id" in updateGroup
          ? (updateGroup as { program_id?: unknown }).program_id
          : undefined;

      if (typeof programIdValue === "string" && programIdValue.length > 0) {
        return programIdValue;
      }

      const programId =
        typeof programIdValue === "object" && programIdValue !== null && "requested_value" in programIdValue
          ? (programIdValue as { requested_value?: unknown }).requested_value
          : undefined;

      if (typeof programId === "string" && programId.length > 0) {
        return programId;
      }
    }
  }

  return undefined;
}

function resolveProgramStatusForSuccess(operation: "CREATE_PROGRAM" | "EDIT_PROGRAM" | "END_PROGRAM", startDate?: string) {
  if (operation === "END_PROGRAM") {
    return "ENDED" as const;
  }

  return hasFutureStartDate(startDate) ? ("SCHEDULED" as const) : ("ACTIVE" as const);
}

export function mapCreateProgramFormToDto(
  values: CreateProgramFormValues,
  encryptedBusinessId: string
): YelpCreateProgramRequestDto {
  return {
    business_id: encryptedBusinessId,
    program_name: values.programType,
    start: toDateOnlyOrUndefined(values.startDate),
    currency: values.currency,
    budget: values.monthlyBudgetDollars ? parseCurrencyToCents(values.monthlyBudgetDollars) : undefined,
    is_autobid: values.programType === "CPC" ? values.isAutobid : undefined,
    max_bid: !values.isAutobid && values.maxBidDollars ? parseCurrencyToCents(values.maxBidDollars) : undefined,
    pacing_method: values.programType === "CPC" ? values.pacingMethod : undefined,
    fee_period: values.programType === "CPC" ? values.feePeriod : undefined,
    ad_categories: values.programType === "CPC" ? values.adCategories : undefined
  };
}

export function mapEditProgramFormToDto(values: EditProgramFormValues): YelpEditProgramRequestDto {
  const hasScheduledBudgetChange = Boolean(values.scheduledBudgetEffectiveDate && values.scheduledBudgetDollars);

  return {
    start: toDateOnlyOrUndefined(values.startDate),
    end: undefined,
    budget: hasScheduledBudgetChange
      ? parseCurrencyToCents(values.scheduledBudgetDollars!)
      : values.monthlyBudgetDollars
        ? parseCurrencyToCents(values.monthlyBudgetDollars)
        : undefined,
    future_budget_date: hasScheduledBudgetChange ? toDateOnlyOrUndefined(values.scheduledBudgetEffectiveDate) : undefined,
    max_bid: !values.isAutobid && values.maxBidDollars ? parseCurrencyToCents(values.maxBidDollars) : undefined,
    pacing_method: values.programType === "CPC" ? values.pacingMethod : undefined,
    ad_categories: values.programType === "CPC" ? values.adCategories : undefined
  };
}

export function mapTerminateProgramFormToDto(values: TerminateProgramFormValues): YelpTerminateProgramRequestDto {
  void values;
  return {};
}

export function mapFeatureFormToDto(values: FeatureFormValues): YelpProgramFeatureDto {
  return values;
}

export function mapReportFormToDto(
  values: ReportRequestFormValues,
  encryptedBusinessIds: string[]
): YelpReportRequestDto {
  return {
    business_ids: encryptedBusinessIds,
    start_date: values.startDate,
    end_date: values.endDate,
    metrics: values.metrics
  };
}

export function mapSubmittedYelpJob(response: YelpJobSubmissionResponseDto): {
  jobStatus: JobStatus;
  programStatus: ProgramStatus;
  isTerminal: boolean;
} {
  void response;
  return {
    jobStatus: "QUEUED",
    programStatus: "QUEUED",
    isTerminal: false
  };
}

export function mapYelpJobStatusReceipt(
  receipt: YelpJobStatusResponseDto,
  operation: "CREATE_PROGRAM" | "EDIT_PROGRAM" | "END_PROGRAM",
  startDate?: string
): {
  jobStatus: JobStatus;
  programStatus: ProgramStatus;
  isTerminal: boolean;
  upstreamProgramId?: string;
} {
  if (receipt.status === "QUEUED") {
    return { jobStatus: "QUEUED", programStatus: "QUEUED", isTerminal: false };
  }

  if (receipt.status === "PROCESSING") {
    return { jobStatus: "PROCESSING", programStatus: "PROCESSING", isTerminal: false };
  }

  const statuses = collectReceiptStatuses(receipt);
  const hasRejected = statuses.has("REJECTED") || statuses.has("FAILED");
  const hasCompleted = statuses.has("COMPLETED");
  const upstreamProgramId = findUpstreamProgramId(receipt);

  if (hasRejected && hasCompleted) {
    return {
      jobStatus: "PARTIAL",
      programStatus: "PARTIAL",
      isTerminal: true,
      upstreamProgramId
    };
  }

  if (hasRejected) {
    return {
      jobStatus: "FAILED",
      programStatus: "FAILED",
      isTerminal: true,
      upstreamProgramId
    };
  }

  return {
    jobStatus: "COMPLETED",
    programStatus: resolveProgramStatusForSuccess(operation, startDate),
    isTerminal: true,
    upstreamProgramId
  };
}
