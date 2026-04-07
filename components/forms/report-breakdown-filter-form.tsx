import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { reportUnknownBucketValue } from "@/features/reporting/schemas";

export function ReportBreakdownFilterForm({
  reportId,
  values,
  locations,
  serviceCategories
}: {
  reportId: string;
  values: {
    view: "location" | "service";
    from: string;
    to: string;
    locationId?: string;
    serviceCategoryId?: string;
  };
  locations: Array<{ id: string; name: string }>;
  serviceCategories: Array<{ id: string; name: string }>;
}) {
  const resetHref = `/reporting/${reportId}?view=${values.view}`;

  return (
    <form
      action={`/reporting/${reportId}`}
      className="grid gap-4 rounded-[1.6rem] border border-border/80 bg-muted/10 p-5 md:grid-cols-2 2xl:grid-cols-[0.9fr_0.9fr_0.9fr_0.9fr_0.8fr_0.8fr_auto_auto]"
    >
      <input name="view" type="hidden" value={values.view} />

      <div className="space-y-1">
        <label className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground" htmlFor="locationId">
          Location
        </label>
        <select
          className="ui-native-select"
          defaultValue={values.locationId ?? ""}
          id="locationId"
          name="locationId"
        >
          <option value="">All locations</option>
          <option value={reportUnknownBucketValue}>Unknown location</option>
          {locations.map((location) => (
            <option key={location.id} value={location.id}>
              {location.name}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground" htmlFor="serviceCategoryId">
          Service
        </label>
        <select
          className="ui-native-select"
          defaultValue={values.serviceCategoryId ?? ""}
          id="serviceCategoryId"
          name="serviceCategoryId"
        >
          <option value="">All services</option>
          <option value={reportUnknownBucketValue}>Unknown service</option>
          {serviceCategories.map((serviceCategory) => (
            <option key={serviceCategory.id} value={serviceCategory.id}>
              {serviceCategory.name}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground" htmlFor="from">
          From
        </label>
        <Input defaultValue={values.from} id="from" name="from" type="date" />
      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground" htmlFor="to">
          To
        </label>
        <Input defaultValue={values.to} id="to" name="to" type="date" />
      </div>

      <div className="flex items-end">
        <Button className="w-full" type="submit" variant="outline">
          Apply
        </Button>
      </div>

      <div className="flex items-end">
        <Button asChild className="w-full" type="button" variant="ghost">
          <a href={resetHref}>Reset</a>
        </Button>
      </div>
    </form>
  );
}
