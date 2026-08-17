import { Badge } from "@/components/ui/badge";
import {
  getYelpCategoryDisplayLabel,
  normalizeYelpCategories,
} from "@/lib/yelp/categories";
import { resolveProgramCategoryScope } from "@/features/ads-programs/targeting";

export function ProgramCategoryList({
  categories,
  categoryCatalog,
  programType = "CPC",
}: {
  categories: unknown;
  categoryCatalog?: unknown;
  programType?: string;
}) {
  const programCategories = normalizeYelpCategories(categories);
  const catalog = normalizeYelpCategories(categoryCatalog);
  const scope = resolveProgramCategoryScope(
    programType,
    categories,
    categoryCatalog,
  );

  if (scope.kind === "NOT_APPLICABLE") {
    return (
      <span className="text-xs text-muted-foreground">
        Not applicable to this program type
      </span>
    );
  }

  if (programCategories.length === 0) {
    return <Badge variant="outline">Listing-wide · Yelp inferred</Badge>;
  }

  return (
    <div className="flex flex-wrap items-center gap-1">
      <Badge
        variant={scope.kind === "LISTING_WIDE_EXPLICIT" ? "success" : "outline"}
      >
        {scope.kind === "LISTING_WIDE_EXPLICIT"
          ? "Listing-wide"
          : "Category-specific"}
      </Badge>
      {programCategories.map((category) => (
        <Badge
          key={category.alias ?? category.label}
          title={category.alias ? `Yelp alias: ${category.alias}` : undefined}
          variant="secondary"
        >
          {getYelpCategoryDisplayLabel(category, catalog)}
        </Badge>
      ))}
    </div>
  );
}
