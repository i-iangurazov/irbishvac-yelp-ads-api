import { Badge } from "@/components/ui/badge";
import {
  getYelpCategoryDisplayLabel,
  normalizeYelpCategories,
} from "@/lib/yelp/categories";

export function ProgramCategoryList({
  categories,
  categoryCatalog,
}: {
  categories: unknown;
  categoryCatalog?: unknown;
}) {
  const programCategories = normalizeYelpCategories(categories);
  const catalog = normalizeYelpCategories(categoryCatalog);

  if (programCategories.length === 0) {
    return (
      <span className="text-xs text-muted-foreground">No ad categories</span>
    );
  }

  return (
    <div className="flex flex-wrap gap-1">
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
