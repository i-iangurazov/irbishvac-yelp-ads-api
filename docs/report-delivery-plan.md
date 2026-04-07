# Report Delivery Plan

## Current Reporting Foundation

- The current reporting stack already supports:
  - manual report requests
  - Yelp batch polling
  - persisted `ReportRequest` and `ReportResult`
  - raw combined payload export
  - location and service breakdowns on top of saved report data plus lead/CRM outcome data
- The reporting pipeline is honest about delayed Yelp data and keeps internal-derived metrics separate.
- There is already an internal cron endpoint at `/api/internal/reconcile` that processes:
  - pending program jobs
  - pending Yelp reports
- The app does **not** yet have:
  - recurring schedule models
  - persisted delivery runs
  - email delivery infrastructure
  - admin controls for scheduled deliveries

## Schedule Model

### New schedule record

- Add `ReportSchedule` with:
  - `tenantId`
  - `name`
  - `cadence` = `WEEKLY` or `MONTHLY`
  - `timezone`
  - `sendDayOfWeek` for weekly schedules
  - `sendDayOfMonth` for monthly schedules
  - `sendHour`
  - `sendMinute`
  - `deliverPerLocation`
  - `recipientEmailsJson`
  - `isEnabled`
  - `lastTriggeredAt`
  - `lastSuccessfulGenerationAt`
  - `lastSuccessfulDeliveryAt`
- Keep schedules account-level.
  - `deliverPerLocation=true` means the same account run fans out into location-scoped delivery records.

### New run record

- Add `ReportScheduleRun` with:
  - `scheduleId`
  - `tenantId`
  - optional `reportRequestId`
  - optional `locationId`
  - `scope` = `ACCOUNT` or `LOCATION`
  - `windowStart`
  - `windowEnd`
  - `scheduledFor`
  - `generationStatus`
  - `deliveryStatus`
  - `recipientEmailsJson`
  - `dashboardUrl`
  - `errorSummary`
  - `errorJson`
  - timestamps for generation and delivery
- One schedule execution may create:
  - one account-level run
  - zero or more per-location runs when `deliverPerLocation` is enabled

## Generation Flow

### Due schedule processing

- Extend the internal reconcile workflow to process due report schedules.
- Due detection will be timezone-aware and based on:
  - cadence
  - configured send day
  - configured send time
  - whether a run already exists for the same window and scope

### Window calculation

- Weekly schedules:
  - generate the previous 7 complete days ending the day before the scheduled send time
- Monthly schedules:
  - generate the previous full calendar month
- These assumptions are explicit and will be documented in the summary and UI copy.

### Report generation

- For each due schedule:
  - create or reuse a `ReportRequest` over the current business set for the tenant
  - persist `ReportScheduleRun` rows immediately with generation status
  - let the existing report polling flow bring the underlying `ReportRequest` to `READY`
- Once the underlying report is ready:
  - build the account delivery payload from the existing reporting aggregation layer
  - if `deliverPerLocation` is enabled, build one filtered location delivery per mapped location plus `Unknown location` if data exists there

## Delivery Flow

### Transport

- Add SMTP-based email delivery using environment variables, not admin-stored secrets in this slice.
- If SMTP is not configured:
  - schedules and runs still exist
  - generation can succeed
  - delivery fails explicitly with a visible configuration error
- Delivery email will include:
  - summary text
  - dashboard link
  - CSV attachment

### Output contents

- Include where data exists:
  - Yelp-native spend
  - internal-derived leads
  - cost per lead
  - booked
  - scheduled
  - job in progress
  - completed
  - conversion rate
  - location breakdown
  - service breakdown
  - unknown/unmapped buckets
- Every delivery must clearly label:
  - Yelp-native metrics
  - internal-derived metrics

## Admin UX

- Keep the UI inside the existing Reporting module.
- Add a focused admin section with:
  - schedule list
  - create/edit schedule form
  - recent run table
  - delivery state visibility
  - recipient visibility
  - manual regenerate action
  - manual resend action
- Keep it dense and operator/admin-oriented.

## Assumptions and Limits

1. This slice reuses the existing report generation pipeline.
   - it does not introduce a new analytics backend
2. Schedules are account-level.
   - per-location delivery is derived from the same account report
3. Service-level spend stays subject to the same honesty rule as the current breakdown view.
   - if the saved Yelp payload does not carry a safely mappable service key, spend remains in `Unknown service`
4. SMTP config is environment-level for now.
   - tenant-by-tenant email credentials are out of scope
5. PDF delivery remains out of scope in this slice.
