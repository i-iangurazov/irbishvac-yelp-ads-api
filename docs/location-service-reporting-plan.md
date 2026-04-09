# Location and Service Reporting Plan

## Current Reporting State

The reporting stack is already operational, but it is uneven.

Live today:

- `ReportRequest` and `ReportResult` persist delayed Yelp reporting batches.
- `/reporting` supports manual report requests and recurring delivery administration.
- `/reporting/[reportId]` already supports:
  - a saved Yelp batch detail view
  - grouped breakdowns by `location` and `service`
  - filtered CSV export for grouped views
- Grouped reporting already combines:
  - Yelp-native spend from saved report payloads
  - partner lifecycle outcomes from `YelpLead` + `CrmLeadMapping` + current internal status
- Unknown buckets are already preserved for:
  - `Unknown location`
  - `Unknown service`

## What Is Already Trustworthy

These metrics are already grounded in real data:

- Yelp-native:
  - delayed batch spend
  - lead-intake counts from persisted `YelpLead.createdAtYelp`
- Partner lifecycle:
  - mapped leads
  - booked
  - scheduled
  - job in progress
  - completed
- Derived:
  - close rate
  - cost per lead
  - cost per booked job
  - cost per completed job

## Current Dimension Coverage

### Location

Location grouping is based on real mappings already in the repo:

- `YelpLead.locationId`
- fallback to `Business.locationId`
- report payload business-to-location association for spend rows

This is good enough for live operator reporting as long as unmapped businesses stay visible in `Unknown location`.

### Service

Service grouping is based on:

- `YelpLead.serviceCategoryId` for intake and lifecycle metrics
- safe mapping from saved Yelp payload row keys for service-level spend when present

This is intentionally conservative. If the saved Yelp batch does not carry a safely mappable service dimension, spend must stay in `Unknown service`.

## Gaps Remaining

The missing pieces are mostly about breadth and clarity, not architecture.

Current gaps:

- grouped rows do not yet carry the full partner lifecycle set:
  - `active`
  - `contacted`
  - `won`
  - `lost`
- grouped conversion rates are still too narrow
- grouped CSV headers do not explain source boundaries strongly enough by name
- the grouped table is still wider and thinner than it should be for operator scanning
- delivery summaries should reuse the richer grouped metrics instead of a reduced subset

## Handling Unknown / Unmapped Data

Unknown data will remain explicit everywhere.

- location:
  - if neither the lead nor the business can resolve to a location, the row stays in `Unknown location`
- service:
  - if no service category is mapped on the lead, the row stays in `Unknown service`
  - if the Yelp payload spend row cannot be mapped safely to a service, spend stays in `Unknown service`
- export:
  - unknown rows remain in the CSV
- delivery:
  - unknown rows remain in generated summaries instead of being dropped

## UI Changes Needed

The reporting UI does not need a redesign. It needs a tighter grouped operator view.

Planned changes:

- keep `/reporting` as the admin/operator entry point
- keep `/reporting/[reportId]` as the working surface
- expand grouped metrics to show:
  - intake totals
  - mapping coverage
  - partner lifecycle coverage
  - derived rates
  - cost metrics
- reduce spreadsheet-like column sprawl by using denser grouped cells
- keep source/freshness language short:
  - Yelp spend = delayed batch data
  - outcomes = partner lifecycle data

## Delivery Foundation That Can Be Reused

The recurring delivery slice is already built and reusable:

- `ReportSchedule`
- `ReportScheduleRun`
- generation in the internal reconcile flow
- SMTP email delivery
- CSV attachment generation
- resend / regenerate actions

This pass should not rebuild delivery. It should feed better grouped reporting into the existing delivery pipeline.

## Manual QA Strategy

1. Open an existing ready report at `/reporting/[reportId]`.
2. Verify both `By location` and `By service` views render grouped rows.
3. Verify unknown buckets remain visible when mappings are missing.
4. Apply date, location, and service filters and verify totals and CSV export stay aligned.
5. Confirm grouped rows show Yelp-native spend separately from partner lifecycle outcomes.
6. Generate a recurring report and verify the summary email / CSV uses the same grouped metrics and labels.
