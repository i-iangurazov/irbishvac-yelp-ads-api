import { parseCurrencyToCents } from "@/lib/utils/format";

export const YELP_MONTHLY_BUDGET_CAP_CENTS = 6_000_000;

const budgetedStatuses = new Set([
  "ACTIVE",
  "SCHEDULED",
  "QUEUED",
  "PROCESSING",
  "PARTIAL",
]);

export type BudgetPolicyProgram = {
  id: string;
  type: string;
  status: string;
  budgetCents: number | null;
  configurationJson?: unknown;
};

function scheduledBudgetCents(configuration: unknown) {
  if (
    typeof configuration !== "object" ||
    configuration === null ||
    Array.isArray(configuration)
  ) {
    return null;
  }

  const value = (configuration as Record<string, unknown>)
    .scheduledBudgetDollars;

  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }

  try {
    return parseCurrencyToCents(value);
  } catch {
    return null;
  }
}

export function getProgramProtectedBudgetCents(program: BudgetPolicyProgram) {
  if (program.type !== "CPC" || !budgetedStatuses.has(program.status)) {
    return 0;
  }

  return Math.max(
    program.budgetCents ?? 0,
    scheduledBudgetCents(program.configurationJson) ?? 0,
  );
}

export function getMonthlyBudgetPolicyState(programs: BudgetPolicyProgram[]) {
  const protectedBudgets = programs.map((program) => ({
    programId: program.id,
    budgetCents: getProgramProtectedBudgetCents(program),
  }));
  const overCapPrograms = protectedBudgets.filter(
    (program) => program.budgetCents > YELP_MONTHLY_BUDGET_CAP_CENTS,
  );

  return {
    capCents: YELP_MONTHLY_BUDGET_CAP_CENTS,
    highestBudgetCents: Math.max(
      0,
      ...protectedBudgets.map((program) => program.budgetCents),
    ),
    overCapPrograms,
    isOverCap: overCapPrograms.length > 0,
  };
}

export function evaluateMonthlyBudgetChange(
  programs: BudgetPolicyProgram[],
  proposedBudgetCents: number,
  excludeProgramId?: string,
) {
  const currentProgram = excludeProgramId
    ? programs.find((program) => program.id === excludeProgramId)
    : undefined;
  const currentBudgetCents = currentProgram
    ? getProgramProtectedBudgetCents(currentProgram)
    : 0;
  const projectedBudgetCents = Math.max(0, proposedBudgetCents);

  return {
    capCents: YELP_MONTHLY_BUDGET_CAP_CENTS,
    currentBudgetCents,
    projectedBudgetCents,
    isAllowed:
      projectedBudgetCents <= YELP_MONTHLY_BUDGET_CAP_CENTS ||
      (Boolean(excludeProgramId) && projectedBudgetCents < currentBudgetCents),
  };
}
