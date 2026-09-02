import { normalizeProgramCategoryAliases } from "@/features/ads-programs/conflicts";
import {
  getProgramCampaignLayer,
  septemberCampaigns,
  type SeptemberCampaignLayer,
} from "@/features/ads-programs/layers";

type LocalProgram = {
  id: string;
  upstreamProgramId: string | null;
  type: string;
  status: string;
  configurationJson: unknown;
};

type UpstreamProgram = {
  program_id: string;
  program_type: string;
  program_status: string;
  ad_categories: string[];
  start_date?: string | null;
  end_date?: string | null;
  program_metrics?: { budget?: number | null };
};

const approvedSeptemberMainBudgetCents = new Set([990_000, 1_000_000]);

export function isApprovedSeptemberMainProgram(
  program: UpstreamProgram | null | undefined,
) {
  return (
    program?.program_type === "CPC" &&
    program.program_status === "ACTIVE" &&
    approvedSeptemberMainBudgetCents.has(
      program.program_metrics?.budget ?? Number.NaN,
    )
  );
}

export type SeptemberCampaignReconciliationPlan =
  | {
      action: "NOOP" | "UPDATE";
      layer: SeptemberCampaignLayer;
      localProgramId: string | null;
      upstreamProgramId: string;
      reason: string;
    }
  | {
      action: "CREATE";
      layer: SeptemberCampaignLayer;
      localProgramId: null;
      upstreamProgramId: null;
      reason: string;
    }
  | {
      action: "BLOCKED";
      layer: SeptemberCampaignLayer;
      localProgramId: string | null;
      upstreamProgramId: string | null;
      reason: string;
    };

function isCurrentStatus(status: string) {
  return ["DRAFT", "QUEUED", "PROCESSING", "ACTIVE", "SCHEDULED"].includes(
    status,
  );
}

function matchesCategories(actual: unknown, expected: readonly string[]) {
  const aliases = normalizeProgramCategoryAliases(actual);
  return (
    aliases.length === expected.length &&
    expected.every((alias) => aliases.includes(alias))
  );
}

function matchesExactSpecification(
  program: UpstreamProgram,
  layer: SeptemberCampaignLayer,
  categoryAliases: readonly string[] = septemberCampaigns[layer]
    .categoryAliases,
  latestApprovedStartDate: string = septemberCampaigns[layer].startDate,
) {
  const specification = septemberCampaigns[layer];
  const matchesApprovedStartDate =
    layer === "SEPTEMBER_END_OF_MONTH_BOOST"
      ? program.start_date === specification.startDate
      : typeof program.start_date === "string" &&
        program.start_date <= latestApprovedStartDate;

  return (
    program.program_metrics?.budget ===
      Number(specification.monthlyBudgetDollars) * 100 &&
    matchesApprovedStartDate &&
    program.end_date === specification.endDate &&
    matchesCategories(program.ad_categories, categoryAliases)
  );
}

export function planSeptemberCampaignReconciliation(input: {
  layer: SeptemberCampaignLayer;
  localPrograms: LocalProgram[];
  upstreamPrograms: UpstreamProgram[];
  adoptUpstreamProgramId?: string;
  categoryAliases?: readonly string[];
  latestApprovedStartDate?: string;
}): SeptemberCampaignReconciliationPlan {
  const specification = septemberCampaigns[input.layer];
  const categoryAliases =
    input.categoryAliases ?? specification.categoryAliases;
  const latestApprovedStartDate =
    input.latestApprovedStartDate ?? specification.startDate;

  if (
    input.layer === "SEPTEMBER_END_OF_MONTH_BOOST" &&
    categoryAliases.length === 0
  ) {
    return {
      action: "BLOCKED",
      layer: input.layer,
      localProgramId: null,
      upstreamProgramId: null,
      reason:
        "Select at least one approved End-of-Month Boost service direction.",
    };
  }

  const currentLocal = input.localPrograms.filter(
    (program) => program.type === "CPC" && isCurrentStatus(program.status),
  );
  const taggedLocal = currentLocal.filter(
    (program) =>
      getProgramCampaignLayer(program.configurationJson) === input.layer,
  );

  if (taggedLocal.length > 1) {
    return {
      action: "BLOCKED",
      layer: input.layer,
      localProgramId: null,
      upstreamProgramId: null,
      reason: "Multiple current local programs use the same September layer.",
    };
  }

  const currentUpstream = input.upstreamPrograms.filter(
    (program) =>
      program.program_type === "CPC" &&
      (isCurrentStatus(program.program_status) ||
        (program.program_status === "INACTIVE" &&
          matchesExactSpecification(
            program,
            input.layer,
            categoryAliases,
            latestApprovedStartDate,
          ))),
  );
  const taggedProgram = taggedLocal[0] ?? null;

  if (taggedProgram && !taggedProgram.upstreamProgramId) {
    return {
      action: "BLOCKED",
      layer: input.layer,
      localProgramId: taggedProgram.id,
      upstreamProgramId: null,
      reason:
        "The tagged local program has no confirmed Yelp program ID; reconcile its pending job first.",
    };
  }

  const requestedUpstreamProgramId =
    taggedProgram?.upstreamProgramId ?? input.adoptUpstreamProgramId ?? null;
  const candidate = requestedUpstreamProgramId
    ? (currentUpstream.find(
        (program) => program.program_id === requestedUpstreamProgramId,
      ) ?? null)
    : null;

  if (requestedUpstreamProgramId && !candidate) {
    return {
      action: "BLOCKED",
      layer: input.layer,
      localProgramId: taggedProgram?.id ?? null,
      upstreamProgramId: requestedUpstreamProgramId,
      reason:
        "The selected Yelp program is not present in the current canonical inventory.",
    };
  }

  if (candidate) {
    const conflictingTag = currentLocal.find(
      (program) =>
        program.upstreamProgramId === candidate.program_id &&
        getProgramCampaignLayer(program.configurationJson) !== "GENERAL" &&
        getProgramCampaignLayer(program.configurationJson) !== input.layer,
    );

    if (conflictingTag) {
      return {
        action: "BLOCKED",
        layer: input.layer,
        localProgramId: conflictingTag.id,
        upstreamProgramId: candidate.program_id,
        reason:
          "The selected Yelp program is already assigned to another managed layer.",
      };
    }

    if (!matchesCategories(candidate.ad_categories, categoryAliases)) {
      return {
        action: "BLOCKED",
        layer: input.layer,
        localProgramId: taggedProgram?.id ?? null,
        upstreamProgramId: candidate.program_id,
        reason:
          "The selected Yelp program does not match the approved category scope.",
      };
    }

    const localMatch =
      taggedProgram ??
      currentLocal.find(
        (program) => program.upstreamProgramId === candidate.program_id,
      ) ??
      null;

    return {
      action: matchesExactSpecification(
        candidate,
        input.layer,
        categoryAliases,
        latestApprovedStartDate,
      )
        ? "NOOP"
        : "UPDATE",
      layer: input.layer,
      localProgramId: localMatch?.id ?? null,
      upstreamProgramId: candidate.program_id,
      reason: matchesExactSpecification(
        candidate,
        input.layer,
        categoryAliases,
        latestApprovedStartDate,
      )
        ? "The selected Yelp program already has the approved September values."
        : "The selected Yelp program exists but does not match the approved September values.",
    };
  }

  const assignedUpstreamProgramIds = new Set(
    currentLocal
      .filter(
        (program) =>
          program.upstreamProgramId &&
          getProgramCampaignLayer(program.configurationJson) !== "GENERAL",
      )
      .map((program) => program.upstreamProgramId),
  );
  const adoptionCandidates = currentUpstream.filter(
    (program) =>
      !assignedUpstreamProgramIds.has(program.program_id) &&
      program.program_metrics?.budget ===
        Number(specification.monthlyBudgetDollars) * 100 &&
      matchesCategories(program.ad_categories, categoryAliases),
  );

  if (adoptionCandidates.length > 0) {
    return {
      action: "BLOCKED",
      layer: input.layer,
      localProgramId: null,
      upstreamProgramId: null,
      reason:
        "A same-budget, same-category unassigned Yelp program already exists. Provide its exact program ID to adopt it instead of creating a duplicate.",
    };
  }

  return {
    action: "CREATE",
    layer: input.layer,
    localProgramId: null,
    upstreamProgramId: null,
    reason: "No matching assigned September Yelp program exists.",
  };
}

export function verifySeptemberCampaignReadBack(input: {
  layer: SeptemberCampaignLayer;
  upstreamProgramId: string;
  upstreamPrograms: UpstreamProgram[];
  categoryAliases?: readonly string[];
  latestApprovedStartDate?: string;
}) {
  const program = input.upstreamPrograms.find(
    (candidate) => candidate.program_id === input.upstreamProgramId,
  );

  if (!program) {
    return { verified: false, reason: "Yelp read-back omitted the program." };
  }

  if (
    program.program_type !== "CPC" ||
    (!isCurrentStatus(program.program_status) &&
      !(
        program.program_status === "INACTIVE" &&
        matchesExactSpecification(
          program,
          input.layer,
          input.categoryAliases ??
            septemberCampaigns[input.layer].categoryAliases,
          input.latestApprovedStartDate,
        )
      )) ||
    !matchesExactSpecification(
      program,
      input.layer,
      input.categoryAliases ?? septemberCampaigns[input.layer].categoryAliases,
      input.latestApprovedStartDate,
    )
  ) {
    return {
      verified: false,
      reason:
        "Yelp read-back values do not match the approved September campaign.",
    };
  }

  return {
    verified: true,
    reason: "Yelp read-back matched every approved September value.",
  };
}
