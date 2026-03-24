import type { ProgramStatus, ProgramType } from "@prisma/client";

type ProgramConflictCandidate = {
  id: string;
  type: ProgramType;
  status: ProgramStatus;
  adCategoriesJson?: unknown;
  upstreamProgramId?: string | null;
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

export function cpcCategoryTargetsOverlap(left: unknown, right: unknown) {
  const leftAliases = normalizeProgramCategoryAliases(left);
  const rightAliases = normalizeProgramCategoryAliases(right);

  if (leftAliases.length === 0 || rightAliases.length === 0) {
    return true;
  }

  return leftAliases.some((alias) => rightAliases.includes(alias));
}

export function findConflictingCpcPrograms(
  programs: ProgramConflictCandidate[],
  requestedCategories: unknown,
  excludeProgramId?: string
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

    return cpcCategoryTargetsOverlap(program.adCategoriesJson, requestedCategories);
  });
}
