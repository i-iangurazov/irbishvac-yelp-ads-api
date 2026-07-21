import { parseCurrencyToCents } from "@/lib/utils/format";

export const YELP_BUDGET_DAYS_PER_MONTH = 30;

export function dailyBudgetCentsToMonthlyBudgetCents(dailyBudgetCents: number) {
  return dailyBudgetCents * YELP_BUDGET_DAYS_PER_MONTH;
}

export function dailyBudgetDollarsToMonthlyBudgetCents(
  dailyBudgetDollars: string,
) {
  return dailyBudgetCentsToMonthlyBudgetCents(
    parseCurrencyToCents(dailyBudgetDollars),
  );
}

export function monthlyBudgetCentsToDailyBudgetCents(
  monthlyBudgetCents: number,
) {
  return Math.round(monthlyBudgetCents / YELP_BUDGET_DAYS_PER_MONTH);
}

export function monthlyBudgetCentsToDailyBudgetDollars(
  monthlyBudgetCents: number | null | undefined,
) {
  if (typeof monthlyBudgetCents !== "number") {
    return "";
  }

  return String(monthlyBudgetCentsToDailyBudgetCents(monthlyBudgetCents) / 100);
}

export function monthlyBudgetDollarsToDailyBudgetDollars(
  monthlyBudgetDollars: string | null | undefined,
) {
  if (!monthlyBudgetDollars) {
    return "";
  }

  try {
    return monthlyBudgetCentsToDailyBudgetDollars(
      parseCurrencyToCents(monthlyBudgetDollars),
    );
  } catch {
    return "";
  }
}

export function monthlyBudgetDollarsFromDailyInput(dailyBudgetDollars: string) {
  if (!dailyBudgetDollars) {
    return "";
  }

  try {
    return String(
      dailyBudgetDollarsToMonthlyBudgetCents(dailyBudgetDollars) / 100,
    );
  } catch {
    return dailyBudgetDollars;
  }
}
