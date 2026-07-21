import { formatCurrency } from "@/lib/utils/format";
import { monthlyBudgetCentsToDailyBudgetCents } from "@/lib/yelp/budget";

export function YelpBudgetDisplay({
  monthlyBudgetCents,
  currency = "USD",
  className,
}: {
  monthlyBudgetCents: number | null | undefined;
  currency?: string;
  className?: string;
}) {
  if (typeof monthlyBudgetCents !== "number") {
    return <span className={className}>Not set</span>;
  }

  return (
    <div className={className}>
      <div className="font-medium">
        {formatCurrency(
          monthlyBudgetCentsToDailyBudgetCents(monthlyBudgetCents),
          currency,
        )}{" "}
        / day avg
      </div>
      <div className="text-xs text-muted-foreground">
        Est. {formatCurrency(monthlyBudgetCents, currency)} / month max
      </div>
    </div>
  );
}
