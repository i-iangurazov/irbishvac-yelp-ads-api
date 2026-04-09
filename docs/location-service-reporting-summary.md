# Location and Service Reporting Summary

## What Was Implemented

Grouped reporting was already present in the repo, but it was too thin. This pass made it business-usable.

Implemented:

- richer grouped aggregation in [features/reporting/breakdowns.ts](/Users/ilias_iangurazov/Commercial/irbishvac-yelp-ads-api/features/reporting/breakdowns.ts)
  - Yelp-native:
    - `yelpSpendCents`
    - total Yelp lead intake count
  - partner lifecycle:
    - mapped leads
    - active
    - contacted
    - booked
    - scheduled
    - job in progress
    - completed
    - won
    - lost
  - derived:
    - mapping rate
    - booked rate
    - scheduled rate
    - completion rate
    - win rate
    - close rate
    - cost per lead
    - cost per booked lead
    - cost per completed job
- explicit unknown buckets remain first-class:
  - `Unknown location`
  - `Unknown service`
- grouped CSV exports now use source-scoped headers so the file stays understandable outside the UI
- the grouped table on [reporting/[reportId]/page.tsx](/Users/ilias_iangurazov/Commercial/irbishvac-yelp-ads-api/app/(console)/reporting/[reportId]/page.tsx) was reshaped into denser operator cells instead of a very wide spreadsheet
- the reporting index on [reporting/page.tsx](/Users/ilias_iangurazov/Commercial/irbishvac-yelp-ads-api/app/(console)/reporting/page.tsx) now surfaces a fuller partner lifecycle summary

## What Is Now Truly Live

- breakdown by location
- breakdown by service
- filtering by:
  - date range
  - location
  - service
- grouped conversion metrics derived from real partner lifecycle data
- unknown/unmapped bucket visibility
- filtered CSV export for the grouped view shown on screen

## Assumptions and Limitations

1. Location grouping uses the best available real mapping:
   - `YelpLead.locationId`
   - fallback to `Business.locationId`

2. Service grouping uses only real service mappings:
   - `YelpLead.serviceCategoryId` for lead/outcome grouping
   - safe payload service keys for spend grouping

3. Service spend is intentionally conservative.
   - If the saved Yelp payload does not carry a safely mappable service dimension, spend stays in `Unknown service`.

4. Internal outcomes are current-state cohort metrics for leads created in the selected report window.
   - They are not Yelp-native statuses or attribution claims.

5. This slice does not redesign the reporting module or add executive dashboards.

## Exact Manual QA Steps

1. Open a ready saved report at `/reporting/{reportId}`.
2. Confirm the page still shows Yelp batch details and export.
3. Switch between `By location` and `By service`.
4. Verify grouped rows now show:
   - Yelp spend
   - intake totals
   - mapped leads
   - lifecycle counts
   - conversion rates
   - cost metrics
5. Apply date, location, and service filters.
6. Confirm the grouped rows and totals update consistently.
7. Confirm `Unknown location` and `Unknown service` remain visible when mappings are missing.
8. Export CSV from both grouped views and confirm the file headers are source-scoped and match the current filters.

## Verification

Validated with:

- `pnpm test tests/unit/reporting-breakdowns.test.ts tests/unit/report-delivery.test.ts tests/integration/report-export-route.test.ts`
- `pnpm typecheck`
