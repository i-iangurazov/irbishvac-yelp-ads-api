# ServiceTitan Lifecycle Sync Summary

## What was implemented

This slice turns ServiceTitan from a configuration-only connector into a real downstream lifecycle reconciliation path.

- Added a ServiceTitan lifecycle poller/reconcile workflow in `features/crm-connector/lifecycle-service.ts`.
- Added conservative ServiceTitan -> partner lifecycle mapping helpers in `features/crm-connector/lifecycle-normalize.ts`.
- Added ServiceTitan record fetch support for mapped lead, job, and job appointments in `lib/servicetitan/client.ts`.
- Added lifecycle coverage and candidate queries in `lib/db/crm-connector-repository.ts`.
- Added a manual lifecycle sync route at `app/api/integrations/servicetitan/lifecycle-sync/route.ts`.
- Extended the internal reconcile route so scheduled runs also process due ServiceTitan lifecycle updates through `app/api/internal/reconcile/route.ts`.
- Surfaced lifecycle sync health on the Integrations page, lifecycle provenance on lead detail, and lifecycle freshness context on reporting.
- Extended operator issue detection so failed ServiceTitan lifecycle syncs and stale lifecycle refreshes feed into the existing queue.

## What is truly live now

These partner lifecycle states can now be sourced more reliably from pulled ServiceTitan data when mapped records exist:

- `ACTIVE`
- `CONTACTED`
- `BOOKED`
- `SCHEDULED`
- `JOB_IN_PROGRESS`
- `COMPLETED`
- `CANCELED`
- `CLOSED_LOST`

`CLOSED_WON` remains conservative and is not inferred unless a supported downstream signal clearly maps to it. The current workflow favors explicit booked, scheduled, progress, completed, and lost states over invented close semantics.

## How source boundaries are preserved

- Yelp-native lead intake and thread events still come only from Yelp APIs and webhook/read reconciliation.
- ServiceTitan-derived lifecycle updates are appended as partner lifecycle events in `CrmStatusEvent`.
- The lead’s current internal lifecycle status is derived from CRM/Internal timeline evidence and never written back as a Yelp-native state.
- UI copy continues to treat these as partner lifecycle statuses based on Yelp leads, not official Yelp statuses.

## What remains manual or out of scope

- No ServiceTitan webhook ingestion; this slice is poll/reconcile based.
- No multi-connector deep lifecycle poller.
- No back-sync of lifecycle states to Yelp.
- No destructive history rewrites; only append/update-safe lifecycle reconciliation.
- No automatic reconciliation for leads without a credible mapping to a ServiceTitan lead/job.
- No revenue, invoice, or advanced dispatch analytics in this slice.

## Assumptions and limitations

- Reliable lifecycle sync depends on valid ServiceTitan credentials and real mapped `externalCrmLeadId` and/or `externalJobId` values.
- If a mapping has no ServiceTitan identifiers, it remains visible as manual-only coverage and cannot be polled.
- Ambiguous upstream statuses are mapped conservatively.
- Sync cadence is intentionally bounded:
  - due refresh threshold: 4 hours
  - stale refresh threshold: 48 hours
- Appointment polling is currently scoped through the mapped/discovered ServiceTitan job.

## Manual QA steps

1. Open `/integrations` and confirm the ServiceTitan connector is enabled and healthy.
2. Run `Sync due lifecycle updates` from the ServiceTitan module.
3. Verify a new connector sync row appears with type label `ServiceTitan lifecycle sync`.
4. Open a Yelp-originated lead that has a matched ServiceTitan mapping.
5. Confirm the partner lifecycle timeline shows connector-derived entries with the `ServiceTitan` provenance badge.
6. Confirm the current partner lifecycle status on the lead updates only when newer downstream evidence exists.
7. Trigger a failing lifecycle sync by using an invalid or missing upstream record and confirm:
   - the sync run fails or becomes partial
   - the operator queue receives a linked lifecycle sync issue
8. Leave a mapped lead unsynced past the stale threshold and confirm the operator queue shows a stale lifecycle issue.
9. Open `/reporting` and confirm the internal conversion summary shows the latest ServiceTitan lifecycle refresh timestamp when available.
