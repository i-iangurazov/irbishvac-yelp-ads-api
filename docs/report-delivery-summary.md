# Report Delivery Summary

## What Was Implemented

- Added recurring report schedules with persisted configuration:
  - weekly and monthly cadence
  - timezone-aware send timing
  - recipient lists
  - enabled / disabled state
  - optional per-location delivery fan-out
- Added persisted report delivery runs:
  - generation status
  - delivery status
  - reporting window
  - scope (`ACCOUNT` or `LOCATION`)
  - dashboard URL
  - generated summary payload
  - error summary and raw error JSON
  - timestamps for generation and delivery
- Extended the internal reconcile flow so it now:
  - enqueues due schedules
  - reuses the current Yelp report request and polling workflow
  - hydrates ready runs from the current reporting aggregation layer
  - sends pending deliveries when SMTP is configured
- Added SMTP-based email delivery using environment variables:
  - summary email body
  - dashboard link
  - CSV attachment
- Added focused admin UI inside the existing Reporting module:
  - schedule list
  - create / edit form
  - recent delivery runs
  - generate-now control
  - resend control
- Kept source boundaries explicit in generated output:
  - Yelp-native delayed batch metrics
  - internal-derived CRM lead and outcome metrics
- Kept unknown and unmapped buckets visible in the generated reporting payloads and CSV outputs.

## Assumptions

- Weekly schedules generate the previous 7 complete days ending the day before the scheduled send time.
- Monthly schedules generate the previous full calendar month.
- Schedules operate at the tenant account level.
- When `deliverPerLocation` is enabled and location rows exist, the account run becomes the generation anchor and location-scoped runs become the deliverable emails.
- SMTP is environment-level in this slice, not tenant-configurable from the admin UI.
- The current report request pipeline remains the source for Yelp batch generation. This slice does not introduce a separate analytics job system.

## Limitations

- PDF delivery is still out of scope.
- Recipients are shared for all per-location fan-out emails in a schedule.
- Schedule editing does not attempt to rewrite already-created historical runs.
- If SMTP is missing, runs still generate and remain visible, but delivery fails explicitly.
- The system does not yet expose a dedicated “preview email” surface.
- Location fan-out depends on the current mapped reporting breakdown. Unknown location remains a first-class bucket instead of being dropped.

## Manual QA Steps

1. Apply migrations and seed or log into an environment with at least one saved business and at least one ready report request path.
2. Open `/reporting` and confirm the new recurring delivery section is visible.
3. Create a weekly schedule with:
   - valid timezone
   - one or more recipients
   - delivery enabled
4. Confirm the schedule appears in the list with:
   - readable cadence/timing
   - recipient count
   - active status
5. Click `Generate now`.
6. Confirm a recent delivery run appears with:
   - correct reporting window
   - `REQUESTED` or `PROCESSING` generation state first
   - eventual `READY` generation state once the report is available
7. If SMTP is configured:
   - confirm the run reaches `SENT`
   - confirm the email contains:
     - spend
     - leads
     - booked / scheduled / job in progress / completed
     - source boundary language
     - dashboard link
     - CSV attachment
8. If SMTP is not configured:
   - confirm the run reaches `FAILED`
   - confirm the error explains the missing SMTP configuration
9. Create a schedule with `Per-location delivery` enabled and generate it.
10. Confirm:
    - the account run is used for generation
    - location-scoped child runs are created when mapped location data exists
    - unknown location remains visible when data is unmapped
11. Use the `Resend` action on a `READY` run and confirm delivery state updates again.
12. Open `/audit` and confirm report schedule create/generate/deliver events are visible.

## Recommended Future Enhancements

- Recipient routing by location or client contact group
- Preview-before-send workflow
- PDF rendering when a stable export pattern exists
- Delivery throttling / batching controls
- Better tenant-facing SMTP diagnostics in Settings
- Explicit run filtering on the Reporting page for account-only vs location-only delivery records
