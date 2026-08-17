import type { ProgramStatus, ProgramType } from "@prisma/client";

import { normalizeProgramCategoryAliases } from "@/features/ads-programs/conflicts";
import { extractYelpCategoryAliases } from "@/lib/yelp/categories";

const currentTargetingStatuses = new Set<ProgramStatus>([
  "ACTIVE",
  "SCHEDULED",
  "QUEUED",
  "PROCESSING",
  "PARTIAL",
]);

export type ProgramCategoryScope =
  | {
      kind: "NOT_APPLICABLE";
      aliases: string[];
    }
  | {
      kind: "LISTING_WIDE_INFERRED" | "LISTING_WIDE_EXPLICIT";
      aliases: string[];
    }
  | {
      kind: "CATEGORY_SPECIFIC";
      aliases: string[];
    };

export type CpcTargetingCandidate = {
  id: string;
  type: ProgramType;
  status: ProgramStatus;
  upstreamProgramId?: string | null;
  adCategoriesJson?: unknown;
};

export type CpcTargetingIssue = {
  code:
    | "LISTING_CATEGORIES_UNAVAILABLE"
    | "MISSING_LISTING_WIDE_PROGRAM"
    | "MULTIPLE_LISTING_WIDE_PROGRAMS"
    | "DUPLICATE_CATEGORY_SCOPE"
    | "OVERLAPPING_CATEGORY_SCOPE"
    | "UNKNOWN_CATEGORY_ALIAS";
  severity: "WARNING" | "ERROR";
  title: string;
  description: string;
  programIds: string[];
  aliases: string[];
};

function programReference(program: CpcTargetingCandidate) {
  return program.upstreamProgramId ?? program.id;
}

export function resolveProgramCategoryScope(
  programType: ProgramType | string,
  categories: unknown,
  listingCategories: unknown,
): ProgramCategoryScope {
  if (programType !== "CPC") {
    return { kind: "NOT_APPLICABLE", aliases: [] };
  }

  const aliases = normalizeProgramCategoryAliases(categories);
  const listingAliases = extractYelpCategoryAliases(listingCategories);

  if (aliases.length === 0) {
    return { kind: "LISTING_WIDE_INFERRED", aliases };
  }

  if (
    listingAliases.length > 0 &&
    listingAliases.every((alias) => aliases.includes(alias))
  ) {
    return { kind: "LISTING_WIDE_EXPLICIT", aliases };
  }

  return { kind: "CATEGORY_SPECIFIC", aliases };
}

function sameAliases(left: string[], right: string[]) {
  return (
    left.length === right.length && left.every((alias) => right.includes(alias))
  );
}

export function analyzeBusinessCpcTargeting(
  programs: CpcTargetingCandidate[],
  listingCategories: unknown,
): CpcTargetingIssue[] {
  const activeCpcPrograms = programs.filter(
    (program) =>
      program.type === "CPC" && currentTargetingStatuses.has(program.status),
  );

  if (activeCpcPrograms.length === 0) {
    return [];
  }

  const listingAliases = extractYelpCategoryAliases(listingCategories);
  const scopedPrograms = activeCpcPrograms.map((program) => ({
    program,
    scope: resolveProgramCategoryScope(
      program.type,
      program.adCategoriesJson,
      listingAliases,
    ),
  }));
  const issues: CpcTargetingIssue[] = [];

  if (listingAliases.length === 0) {
    issues.push({
      code: "LISTING_CATEGORIES_UNAVAILABLE",
      severity: "WARNING",
      title: "Listing categories are unavailable",
      description:
        "The console cannot verify listing-wide coverage until Yelp category aliases are saved for this business.",
      programIds: activeCpcPrograms.map(programReference),
      aliases: [],
    });
  }

  const listingWidePrograms = scopedPrograms.filter(
    ({ scope }) =>
      scope.kind === "LISTING_WIDE_INFERRED" ||
      scope.kind === "LISTING_WIDE_EXPLICIT",
  );

  if (listingAliases.length > 0 && listingWidePrograms.length === 0) {
    issues.push({
      code: "MISSING_LISTING_WIDE_PROGRAM",
      severity: "ERROR",
      title: "No listing-wide CPC program",
      description: `Every current CPC program is category-specific. No program explicitly or implicitly covers all listing categories: ${listingAliases.join(", ")}.`,
      programIds: activeCpcPrograms.map(programReference),
      aliases: listingAliases,
    });
  }

  if (listingWidePrograms.length > 1) {
    issues.push({
      code: "MULTIPLE_LISTING_WIDE_PROGRAMS",
      severity: "ERROR",
      title: "Multiple listing-wide CPC programs",
      description:
        "More than one current CPC program covers the full listing, which can create unintended overlapping spend.",
      programIds: listingWidePrograms.map(({ program }) =>
        programReference(program),
      ),
      aliases: listingAliases,
    });
  }

  const categorySpecificPrograms = scopedPrograms.filter(
    ({ scope }) => scope.kind === "CATEGORY_SPECIFIC",
  );

  for (const { program, scope } of scopedPrograms) {
    if (scope.kind === "LISTING_WIDE_INFERRED") {
      continue;
    }

    const unknownAliases = scope.aliases.filter(
      (alias) => !listingAliases.includes(alias),
    );

    if (listingAliases.length > 0 && unknownAliases.length > 0) {
      issues.push({
        code: "UNKNOWN_CATEGORY_ALIAS",
        severity: "ERROR",
        title: "Program targets categories outside the saved listing",
        description: `${programReference(program)} targets aliases that are not present on the business listing: ${unknownAliases.join(", ")}.`,
        programIds: [programReference(program)],
        aliases: unknownAliases,
      });
    }
  }

  for (
    let leftIndex = 0;
    leftIndex < categorySpecificPrograms.length;
    leftIndex += 1
  ) {
    const left = categorySpecificPrograms[leftIndex];

    for (
      let rightIndex = leftIndex + 1;
      rightIndex < categorySpecificPrograms.length;
      rightIndex += 1
    ) {
      const right = categorySpecificPrograms[rightIndex];
      const overlappingAliases = left.scope.aliases.filter((alias) =>
        right.scope.aliases.includes(alias),
      );

      if (overlappingAliases.length === 0) {
        continue;
      }

      const duplicate = sameAliases(left.scope.aliases, right.scope.aliases);
      issues.push({
        code: duplicate
          ? "DUPLICATE_CATEGORY_SCOPE"
          : "OVERLAPPING_CATEGORY_SCOPE",
        severity: "ERROR",
        title: duplicate
          ? "Duplicate category-specific CPC programs"
          : "Overlapping category-specific CPC programs",
        description: `${programReference(left.program)} and ${programReference(right.program)} both target ${overlappingAliases.join(", ")}.`,
        programIds: [
          programReference(left.program),
          programReference(right.program),
        ],
        aliases: overlappingAliases,
      });
    }
  }

  return issues;
}
