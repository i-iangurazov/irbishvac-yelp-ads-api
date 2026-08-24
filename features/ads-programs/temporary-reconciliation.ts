import {
  getProgramCampaignLayer,
  temporaryAugustCampaigns,
  type CampaignLayer,
} from "@/features/ads-programs/layers";
import { normalizeProgramCategoryAliases } from "@/features/ads-programs/conflicts";

export type TemporaryAugustCampaignLayer = Exclude<
  CampaignLayer,
  "GENERAL" | "MAIN"
>;

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
  end_date?: string | null;
  program_metrics?: { budget?: number | null };
};

export type TemporaryCampaignReconciliationPlan =
  | {
      action: "NOOP" | "UPDATE";
      layer: TemporaryAugustCampaignLayer;
      localProgramId: string | null;
      upstreamProgramId: string;
      reason: string;
    }
  | {
      action: "CREATE";
      layer: TemporaryAugustCampaignLayer;
      localProgramId: null;
      upstreamProgramId: null;
      reason: string;
    }
  | {
      action: "BLOCKED";
      layer: TemporaryAugustCampaignLayer;
      localProgramId: string | null;
      upstreamProgramId: string | null;
      reason: string;
    };

function isCurrentStatus(status: string) {
  return ["DRAFT", "QUEUED", "PROCESSING", "ACTIVE", "SCHEDULED"].includes(
    status,
  );
}

function matchesCategories(actual: unknown, expected: string) {
  const aliases = normalizeProgramCategoryAliases(actual);
  return aliases.length === 1 && aliases[0] === expected;
}

export function planTemporaryAugustCampaignReconciliation(input: {
  layer: TemporaryAugustCampaignLayer;
  localPrograms: LocalProgram[];
  upstreamPrograms: UpstreamProgram[];
}): TemporaryCampaignReconciliationPlan {
  const specification = temporaryAugustCampaigns[input.layer];
  const expectedBudgetCents = Number(specification.monthlyBudgetDollars) * 100;
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
      reason: "Multiple current local programs use the same temporary layer.",
    };
  }

  const currentUpstream = input.upstreamPrograms.filter(
    (program) =>
      program.program_type === "CPC" && isCurrentStatus(program.program_status),
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

  const taggedUpstream = taggedProgram
    ? currentUpstream.find(
        (program) => program.program_id === taggedProgram.upstreamProgramId,
      )
    : null;

  if (taggedProgram && !taggedUpstream) {
    return {
      action: "BLOCKED",
      layer: input.layer,
      localProgramId: taggedProgram.id,
      upstreamProgramId: taggedProgram.upstreamProgramId,
      reason:
        "The tagged local program is not present in the current Yelp inventory.",
    };
  }

  const untaggedCandidates = currentUpstream.filter(
    (program) =>
      matchesCategories(program.ad_categories, specification.categoryAlias) &&
      program.end_date === specification.endDate,
  );
  const candidates = taggedUpstream ? [taggedUpstream] : untaggedCandidates;

  if (candidates.length > 1) {
    return {
      action: "BLOCKED",
      layer: input.layer,
      localProgramId: taggedProgram?.id ?? null,
      upstreamProgramId: null,
      reason:
        "Multiple Yelp programs match this temporary layer; an operator must choose the canonical program.",
    };
  }

  const candidate = candidates[0] ?? null;

  if (candidate) {
    const localMatch =
      taggedProgram ??
      currentLocal.find(
        (program) => program.upstreamProgramId === candidate.program_id,
      ) ??
      null;
    const isExact =
      candidate.program_metrics?.budget === expectedBudgetCents &&
      candidate.end_date === specification.endDate &&
      matchesCategories(candidate.ad_categories, specification.categoryAlias);

    return {
      action: isExact ? "NOOP" : "UPDATE",
      layer: input.layer,
      localProgramId: localMatch?.id ?? null,
      upstreamProgramId: candidate.program_id,
      reason: isExact
        ? "The canonical Yelp program already has the approved temporary values."
        : "The canonical Yelp program exists but does not match the approved temporary values.",
    };
  }

  if (
    input.layer === "AUGUST_PLUMBING_TEMP" &&
    currentUpstream.some((program) =>
      matchesCategories(program.ad_categories, specification.categoryAlias),
    )
  ) {
    return {
      action: "BLOCKED",
      layer: input.layer,
      localProgramId: null,
      upstreamProgramId: null,
      reason:
        "An existing Plumbing Yelp program does not carry the approved temporary end date; creating another would be ambiguous.",
    };
  }

  return {
    action: "CREATE",
    layer: input.layer,
    localProgramId: null,
    upstreamProgramId: null,
    reason: "No matching temporary Yelp program exists.",
  };
}

export function verifyTemporaryAugustCampaignReadBack(input: {
  layer: TemporaryAugustCampaignLayer;
  upstreamProgramId: string;
  upstreamPrograms: UpstreamProgram[];
}) {
  const specification = temporaryAugustCampaigns[input.layer];
  const expectedBudgetCents = Number(specification.monthlyBudgetDollars) * 100;
  const program = input.upstreamPrograms.find(
    (candidate) => candidate.program_id === input.upstreamProgramId,
  );

  if (!program) {
    return { verified: false, reason: "Yelp read-back omitted the program." };
  }

  if (
    program.program_type !== "CPC" ||
    !isCurrentStatus(program.program_status) ||
    program.program_metrics?.budget !== expectedBudgetCents ||
    program.end_date !== specification.endDate ||
    !matchesCategories(program.ad_categories, specification.categoryAlias)
  ) {
    return {
      verified: false,
      reason:
        "Yelp read-back values do not match the approved temporary campaign.",
    };
  }

  return {
    verified: true,
    reason: "Yelp read-back matched every approved value.",
  };
}
