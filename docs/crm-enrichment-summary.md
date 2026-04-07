# CRM Enrichment Summary

## What was implemented

### 1. CRM mapping layer

- Added first-class CRM mapping states in Prisma:
  - `UNRESOLVED`
  - `MATCHED`
  - `MANUAL_OVERRIDE`
  - `CONFLICT`
  - `ERROR`
- Refined `CrmLeadMapping` so unresolved and problem states can exist without inventing a resolved CRM lead ID.
- Added mapping freshness/problem fields:
  - `issueSummary`
  - `lastSyncedAt`
- Added repository and service flows for:
  - loading lead enrichment context
  - manual mapping upsert
  - conflict detection when the same CRM lead ID is already linked elsewhere
  - sync-run and sync-error recording for CRM enrichment actions

### 2. Internal lifecycle status timeline

- Expanded `InternalLeadStatus` to include:
  - `CONTACTED`
  - `CLOSED_WON`
  - `CLOSED_LOST`
- Added a dedicated workflow to append internal lifecycle events into `CrmStatusEvent`.
- Updated `YelpLead.internalStatus` from the latest internal event while keeping the full history separate in `CrmStatusEvent`.
- Internal lifecycle events remain separate from `YelpLeadEvent` so the Yelp-native timeline is never overwritten.

### 3. Lead detail enrichment

- Upgraded `/leads/[leadId]` to show:
  - Yelp-native summary
  - Yelp-native event timeline
  - CRM mapping state and reference IDs
  - internal lifecycle timeline
  - mapping and sync issues
  - source boundary cards for Yelp vs CRM/internal vs local processing
  - latest CRM snapshot when available
- Added compact operator actions on lead detail:
  - save CRM mapping state
  - append internal lifecycle status

### 4. Leads list and exception handling

- Upgraded `/leads` to surface:
  - mapping state
  - current internal status
  - CRM health status
  - CRM exception messages
- Added filters for:
  - mapping state
  - internal status
  - existing business/date/ingestion filters
- Added internal outcome coverage metrics on the list page:
  - booked
  - scheduled
  - completed
  - close rate

### 5. Reporting foundation

- Added backend aggregation for internal-derived conversion metrics:
  - total Yelp leads
  - mapped leads
  - booked leads
  - scheduled jobs
  - completed jobs
  - close rate
- Exposed a compact “Internal conversion foundation” card on `/reporting` so operators can validate derived metrics without confusing them with Yelp batch data.

### 6. Migration and tests

- Added Prisma migration `0003_crm_enrichment`.
- Applied the migration locally with `pnpm prisma:migrate:deploy`.
- Added tests for:
  - resolved/unresolved/conflict/manual override logic
  - stale mapping detection
  - internal status timeline ordering
  - Yelp vs internal timeline separation
  - derived conversion metrics
  - CRM mapping/status route wiring

## What remains out of scope

- automated CRM or ServiceTitan polling
- OAuth/business-access work
- CRM-side search or entity lookup UI
- bulk mapping workflows
- per-location or per-service reporting UI
- any attempt to present internal statuses as Yelp-owned data

## Assumptions and limitations

1. This slice uses the current repo’s internal models as the CRM system-of-record boundary.
   - operator-entered mapping/status records are saved with `INTERNAL`
   - future synced CRM records can use `CRM`
2. The current lead detail UI only exposes manual/operator enrichment actions.
   - it does not claim there is an automated CRM connector if one is not running
3. `MATCHED` is supported in the model and service layer for future synced CRM writes.
   - the lead detail UI intentionally defaults operator-entered resolved links to `MANUAL_OVERRIDE`
4. Close rate is currently calculated as `completedJobs / total Yelp leads`.
   - completed jobs include leads whose current internal status is `COMPLETED` or `CLOSED_WON`
5. Stale mapping detection is conservative.
   - only CRM-sourced mappings are marked stale
   - manual overrides are not labeled stale by default

## Manual QA steps

### 1. Confirm the migration is present

- Run `pnpm prisma:migrate:deploy`
- Expected:
  - migration `0003_crm_enrichment` is applied successfully

### 2. Start from an ingested lead

- Open `/leads`
- Choose any normalized Yelp lead from the queue
- Open `/leads/{leadId}`
- Expected:
  - Yelp summary and Yelp event timeline still render as before
  - CRM mapping card shows `Unresolved` when no mapping exists

### 3. Save a manual CRM mapping

- On `/leads/{leadId}`, use the CRM mapping form
- Set:
  - state = `Manual override`
  - CRM lead ID = any test value, for example `crm-lead-001`
- Submit
- Expected:
  - page refreshes successfully
  - mapping card shows `Manual override`
  - the lead row on `/leads` shows the mapping reference and resolved state
  - `SyncRun` row is created with type `CRM_LEAD_ENRICHMENT`

### 4. Record an internal lifecycle status

- On the same lead detail page, use the internal status form
- Set:
  - status = `Booked` or `Scheduled`
  - timestamp = now
- Submit
- Expected:
  - internal lifecycle timeline gets a new row
  - lead summary updates the current internal status
  - `/leads` reflects the new internal status

### 5. Confirm conflict handling

- Open a different lead
- Try to save the same CRM lead ID used above
- Expected:
  - mapping is recorded as `Conflict`
  - issue summary is visible on lead detail
  - `/leads` shows the conflict state and CRM issue message

### 6. Confirm reporting foundation

- Open `/reporting`
- Expected:
  - the internal conversion foundation card is visible
  - values change after saving internal statuses on leads
  - the card copy makes it clear these metrics are internal-derived, not Yelp batch reporting

### 7. Confirm audit/sync visibility

- Open `/audit`
- Expected:
  - CRM enrichment actions appear in recent events and/or sync runs
  - failed or partial CRM enrichment actions are visible through the sync log
