import type { ProgramStatus, ProgramType } from "@prisma/client";

type ProgramConflictCandidate = {
  id: string;
  type: ProgramType;
  status: ProgramStatus;
  adCategoriesJson?: unknown;
  upstreamProgramId?: string | null;
};

type CategoryOverlapOptions = {
  listingCategoryAliases?: unknown;
};

const duplicateProtectedStatuses = new Set<ProgramStatus>(["QUEUED", "PROCESSING", "ACTIVE", "SCHEDULED"]);

function normalizeAlias(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function normalizeProgramCategoryAliases(input: unknown) {
  if (!Array.isArray(input)) {
    return [];
  }

  return [...new Set(input.map(normalizeAlias).filter(Boolean))];
}

function isListingWideCategoryScope(categories: unknown, listingCategoryAliases: unknown) {
  const categoryAliases = normalizeProgramCategoryAliases(categories);
  const listingAliases = normalizeProgramCategoryAliases(listingCategoryAliases);

  if (categoryAliases.length === 0) {
    return true;
  }

  if (listingAliases.length === 0) {
    return false;
  }

  return listingAliases.every((alias) => categoryAliases.includes(alias));
}

export function cpcCategoryTargetsOverlap(left: unknown, right: unknown, options?: CategoryOverlapOptions) {
  const leftAliases = normalizeProgramCategoryAliases(left);
  const rightAliases = normalizeProgramCategoryAliases(right);
  const leftListingWide = isListingWideCategoryScope(left, options?.listingCategoryAliases);
  const rightListingWide = isListingWideCategoryScope(right, options?.listingCategoryAliases);

  if (leftListingWide && rightListingWide) {
    return true;
  }

  if (leftListingWide || rightListingWide) {
    return false;
  }

  return leftAliases.some((alias) => rightAliases.includes(alias));
}

export function findConflictingCpcPrograms(
  programs: ProgramConflictCandidate[],
  requestedCategories: unknown,
  excludeProgramId?: string,
  options?: CategoryOverlapOptions
) {
  return programs.filter((program) => {
    if (program.id === excludeProgramId) {
      return false;
    }

    if (program.type !== "CPC") {
      return false;
    }

    if (!duplicateProtectedStatuses.has(program.status)) {
      return false;
    }

    return cpcCategoryTargetsOverlap(program.adCategoriesJson, requestedCategories, options);
  });
}
