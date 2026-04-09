# Downstream Status Sync Plan

## 1. What post-intake lifecycle data exists today

The repo already has a substantial downstream foundation:

- `YelpLead` stores the current partner-managed outcome in `internalStatus`.
- `CrmLeadMapping` stores the current mapping between a Yelp lead and internal CRM/job entities.
- `CrmStatusEvent` stores the downstream lifecycle timeline separately from Yelp-native events.
- `SyncRun` and `SyncError` already capture CRM enrichment writes and failures.
- Leads detail already renders:
  - Yelp-native timeline
  - partner lifecycle timeline
  - CRM mapping
  - sync issues
- Reporting already derives some internal metrics from stored lead outcomes.

## 2. What is missing for real downstream status tracking

The current implementation is still too operator-entry-oriented:

- downstream writes mostly arrive through operator forms, not a clean sync endpoint for client/CRM/API systems
- `ACTIVE` is not yet represented as a first-class partner lifecycle status
- reporting foundation does not yet expose the fuller downstream stage set consistently
- repeated CRM sync writes are safe for `externalStatusEventId`, but there is no focused machine-write workflow that combines mapping and lifecycle sync in one request
- Leads queue visibility is present, but it can be more explicit about stale/unmapped/conflict coverage as a downstream sync concern

## 3. How Yelp lead records will map to internal/client-side entities

The sync flow should stay narrow and explicit:

1. identify the Yelp lead by local `leadId` or Yelp `externalLeadId`
2. optionally upsert the current internal mapping:
   - Yelp lead -> CRM lead
   - Yelp lead -> opportunity
   - Yelp lead -> job
   - Yelp lead -> internal location
3. optionally append a downstream lifecycle event
4. update the lead’s current partner lifecycle status from the latest downstream event
5. store the sync run, errors, source system, and timestamps

The machine-write workflow will use:

- `sourceSystem: CRM` for client/CRM/API syncs
- `sourceSystem: INTERNAL` for operator-entered overrides
- `CrmLeadMapping.state` to keep uncertainty explicit:
  - `UNRESOLVED`
  - `MATCHED`
  - `MANUAL_OVERRIDE`
  - `CONFLICT`
  - `ERROR`

## 4. Source-of-truth boundaries

- Yelp remains the source of truth for:
  - lead creation
  - Yelp thread events
  - read/replied markers
- Internal/client systems remain the source of truth for:
  - partner lifecycle statuses
  - job/booking progression
  - CRM identifiers
  - won/lost outcomes
- The console is the source of truth for:
  - sync runs
  - local overrides
  - retry/failure tracking
  - operator notes

Internal lifecycle records must stay separate from Yelp-native events at every layer.

## 5. Which states will be supported first

This slice will make the following partner lifecycle states fully usable:

- `ACTIVE`
- `NEW`
- `CONTACTED`
- `BOOKED`
- `SCHEDULED`
- `JOB_IN_PROGRESS`
- `COMPLETED`
- `CANCELED`
- `CLOSED_WON`
- `CLOSED_LOST`
- `LOST`

These are explicitly partner lifecycle statuses based on Yelp leads, not Yelp statuses.

## 6. Operator UX changes needed

- keep Leads detail split between Yelp-native and partner lifecycle sections
- make mapping health and downstream sync health more obvious
- keep unmapped, stale, conflict, and failed-sync conditions visible in the queue
- preserve the current operator forms, but make them clearly secondary to the real sync path
- avoid adding new top-level product sections

## 7. Manual QA strategy

1. ingest a Yelp lead through webhook or backfill
2. call the downstream sync endpoint with:
   - a mapping update
   - a CRM lifecycle event
3. repeat the same lifecycle event with the same external event ID and confirm it does not duplicate
4. send a conflicting mapping and confirm the lead surfaces conflict state
5. open lead detail and confirm:
   - Yelp timeline is unchanged
   - partner lifecycle timeline is separate
   - mapping state and sync issues are visible
6. open Leads queue and confirm unmapped/stale/problem states remain visible
7. open Reporting and confirm downstream metrics reflect the stored lifecycle outcomes without being labeled as Yelp-native
