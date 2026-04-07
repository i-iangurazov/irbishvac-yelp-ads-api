# Location and Service Reporting Plan

## Current State

- The reporting index and detail pages are still centered on raw Yelp batch requests and saved payloads.
- `ReportRequest` and `ReportResult` are operational, but the current detail view only renders:
  - combined Yelp totals
  - a generic trend chart
  - a raw row table
  - CSV export of the raw combined payload
- The schema already has the dimensions needed for real grouping:
  - `Business.locationId`
  - `YelpLead.locationId`
  - `YelpLead.serviceCategoryId`
  - `YelpReportingSnapshot.locationId`
  - `YelpReportingSnapshot.serviceCategoryId`
- The current live pipeline does **not** populate `YelpReportingSnapshot`, so the active reporting slice still depends on `ReportResult`.
- CRM enrichment now provides:
  - resolved/unresolved mapping state
  - `YelpLead.internalStatus`
  - internal lifecycle status history
- Service mapping is still sparse.
  - We can only group by `serviceCategoryId` when it is explicitly set.
  - Unmapped leads must stay visible in an explicit unknown bucket.

## What This Slice Will Add

### 1. Reporting dimensions

- Use real dimensions only:
  - location from `Business.locationId` and `YelpLead.locationId`
  - service from `YelpLead.serviceCategoryId`
- Add explicit unknown buckets:
  - `Unknown location`
  - `Unknown service`
- Never drop unmapped data from grouped views.

### 2. Aggregation model

- Build a reporting aggregation helper on top of:
  - the selected `ReportRequest` / `ReportResult` set for Yelp spend
  - `YelpLead` + CRM mapping/outcome state for internal metrics
- Scope internal metrics to leads created inside the selected reporting window.
- Treat internal outcomes as a lead cohort view:
  - total leads
  - mapped leads
  - booked
  - scheduled
  - completed
  - close rate
- Add cost metrics where spend exists:
  - cost per lead
  - cost per booked job
  - cost per completed job

### 3. Spend allocation rules

- Location spend:
  - group Yelp spend by the business-to-location mapping when available
  - otherwise place it in `Unknown location`
- Service spend:
  - use explicit service dimension rows only if the saved Yelp payload already contains a service key we can map safely
  - otherwise keep Yelp spend in `Unknown service`
- Do **not** distribute business-level Yelp spend across services heuristically.

## UI Changes

- Extend the existing report detail route instead of adding new pages.
- Add:
  - a breakdown view switch: `By location` / `By service`
  - filter controls for:
    - date range within the report window
    - location
    - service category
  - operator tables for the grouped rows
  - filtered CSV export
- Keep the existing honest reporting language:
  - Yelp batch data is delayed
  - internal outcome metrics are internal-derived
  - unknown buckets are visible when mappings are missing

## Backend Changes

- Add report breakdown filter parsing.
- Add repository reads for:
  - report detail
  - location options
  - service category options
  - leads inside the report window and business scope
- Add pure aggregation helpers for:
  - grouped location rows
  - grouped service rows
  - totals and percentages
  - filtered CSV shaping

## Tests

- Add tests for:
  - grouping by location
  - grouping by service
  - unknown/unmapped bucket handling
  - cost metric calculations
  - filtered CSV export rows

## Explicit Boundaries

- This slice will not:
  - create a new executive dashboard
  - fake service-level Yelp spend where the payload is not mapped
  - introduce location/service nav sections
  - redesign the reporting module beyond the breakdown tables and filters
