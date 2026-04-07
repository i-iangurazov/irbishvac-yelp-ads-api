# Location and Service Reporting Summary

## What was implemented

### 1. Dimension-aware reporting aggregation

- Added a new reporting aggregation helper in `features/reporting/breakdowns.ts`.
- Reporting can now group operator metrics by:
  - location
  - service category
- Both grouped views preserve explicit unknown buckets:
  - `Unknown location`
  - `Unknown service`
- Unmapped records are never dropped from the breakdown.

### 2. Real lead and CRM outcome metrics

- Internal-derived metrics now come from real `YelpLead` records and their current CRM-enriched state:
  - total leads
  - mapped leads
  - booked
  - scheduled
  - completed
  - close rate
- These metrics are scoped to leads created inside the selected report window.

### 3. Yelp spend integration

- Yelp spend is still taken from saved Yelp reporting batches.
- Location spend is grouped using the saved business-to-location mapping when available.
- Service spend is only grouped to a service when the saved Yelp payload carries a service key that can be mapped safely.
- Otherwise Yelp spend stays in `Unknown service`.

### 4. Reporting UI extension

- Extended the existing report detail route instead of adding new pages.
- Added:
  - `By location` and `By service` views
  - date range filtering within the report window
  - location filtering
  - service filtering
  - strong table-based grouped views
  - visible unknown rows
  - filtered CSV export
- Kept the raw Yelp table and chart on the page so the underlying batch snapshot is still inspectable.

### 5. Export

- Extended `/api/reports/[reportId]/export` to support filtered location/service CSV exports.
- Raw combined-report CSV export still works when no grouped view is selected.

### 6. Tests

- Added tests for:
  - grouping by location
  - grouping by service
  - unknown/unmapped buckets
  - cost metric calculations
  - filtered CSV row shaping

## Assumptions

1. Location reporting uses the best real mapping available today:
   - `YelpLead.locationId` first
   - fallback to `Business.locationId`
2. Service reporting only uses `YelpLead.serviceCategoryId` for lead/outcome grouping.
   - if a lead is not explicitly mapped, it stays in `Unknown service`
3. Internal outcome metrics are a lead cohort view.
   - they represent the current internal outcome of leads created in the selected window
4. Close rate is currently:
   - `completed / total leads`
   - completed includes `COMPLETED` and `CLOSED_WON`

## Limitations

- The current active reporting pipeline still saves `ReportResult`, not normalized `YelpReportingSnapshot`.
- Because of that:
  - service-level Yelp spend is only available when the saved Yelp payload itself contains a safe service key
  - otherwise service spend remains in `Unknown service`
- Narrow date filters depend on row-level spend data in the saved batch payload.
  - if a payload only contains totals, the spend fallback cannot be split more granularly than the saved report window
- This slice does not add per-location or per-service nav sections.
- This slice does not introduce executive dashboarding or attribution claims.

## Manual QA steps

### 1. Open an existing report

- Go to `/reporting/{reportId}`
- Expected:
  - the existing Yelp batch details still render
  - the page now includes `By location` / `By service` controls

### 2. Check location breakdown

- Switch to `By location`
- Expected:
  - grouped rows render in a dense table
  - `Unknown location` appears when businesses or leads are not mapped
  - Yelp spend is attached only to mapped locations or unknown

### 3. Check service breakdown

- Switch to `By service`
- Expected:
  - grouped rows render in a dense table
  - `Unknown service` stays visible for unmapped leads
  - service spend only leaves the unknown bucket when the saved Yelp payload contains a safely mappable service key

### 4. Apply filters

- Use date, location, and service filters
- Expected:
  - the grouped rows update
  - totals and cost metrics update consistently
  - filters never hide unknown rows unless the selected filter intentionally excludes them

### 5. Export CSV

- Export from:
  - `By location`
  - `By service`
- Expected:
  - the CSV reflects the current filters and grouping
  - raw CSV export still works when no grouped view is requested

### 6. Check source boundaries

- On the report detail page
- Expected:
  - Yelp spend still reads as batch-based and delayed
  - internal outcome metrics read as internal-derived
  - no copy implies live attribution
