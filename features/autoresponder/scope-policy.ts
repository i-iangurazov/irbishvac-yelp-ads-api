import { YelpValidationError } from "@/lib/yelp/errors";

type TenantAutomationOptions = {
  businesses: ReadonlyArray<{ id: string }>;
  locations: ReadonlyArray<{ id: string }>;
  serviceCategories: ReadonlyArray<{ id: string }>;
};

export function assertTenantAutomationScope(
  options: TenantAutomationOptions,
  selection: {
    businessIds?: ReadonlyArray<string | null | undefined>;
    locationIds?: ReadonlyArray<string | null | undefined>;
    serviceCategoryIds?: ReadonlyArray<string | null | undefined>;
  },
) {
  const allowedBusinesses = new Set(options.businesses.map(({ id }) => id));
  const allowedLocations = new Set(options.locations.map(({ id }) => id));
  const allowedServices = new Set(
    options.serviceCategories.map(({ id }) => id),
  );

  if (
    selection.businessIds?.some(
      (id) => Boolean(id) && !allowedBusinesses.has(id as string),
    )
  ) {
    throw new YelpValidationError(
      "The selected business is not available in the active tenant.",
    );
  }

  if (
    selection.locationIds?.some(
      (id) => Boolean(id) && !allowedLocations.has(id as string),
    )
  ) {
    throw new YelpValidationError(
      "The selected location is not available in the active tenant.",
    );
  }

  if (
    selection.serviceCategoryIds?.some(
      (id) => Boolean(id) && !allowedServices.has(id as string),
    )
  ) {
    throw new YelpValidationError(
      "The selected service is not available in the active tenant.",
    );
  }
}
