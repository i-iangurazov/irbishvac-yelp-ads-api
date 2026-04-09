# ServiceTitan Lifecycle Sync Plan

## Current State Audit

### What downstream sync exists today

The repo already has a real downstream sync foundation, but it is still mostly **push-based**:

- Yelp-originated leads are stored in `YelpLead`.
- Downstream mappings are stored in `CrmLeadMapping`.
- Partner lifecycle events are stored in `CrmStatusEvent`.
- Current partner lifecycle status is denormalized onto `YelpLead.internalStatus`.
- Operator and internal API workflows can append mapping and lifecycle updates through:
  - `features/crm-enrichment/service.ts`
  - `app/api/internal/leads/downstream-sync/route.ts`
- Sync execution state is stored in:
  - `SyncRun`
  - `SyncError`

This means the product can already represent downstream truth safely, but it still depends on an outside system to push updates into the machine-write route.

### What is machine-write vs pull-based today

Machine-write today:

- `POST /api/internal/leads/downstream-sync`
- operator mapping actions on lead detail
- operator lifecycle status append actions on lead detail

Pull-based today:

- ServiceTitan connector config, auth test, business-unit sync, and category sync
- no real ServiceTitan lifecycle polling yet

So the connector can be configured and mapped in-product, but the connector is not yet the main source of downstream lifecycle updates.

## What ServiceTitan Data Should Be Polled First

The first safe poll scope should be the entities that already have a clear place in the existing mapping model:

1. ServiceTitan lead records for `CrmLeadMapping.externalCrmLeadId`
2. ServiceTitan job records for `CrmLeadMapping.externalJobId`
3. ServiceTitan appointment records linked to a mapped job where available

This keeps the first poller grounded in existing durable identifiers instead of inventing tenant-wide fuzzy matching.

## How Yelp Leads Reconcile To ServiceTitan Records

The reconciliation path should stay narrow and deterministic:

1. Start from Yelp leads already linked through `CrmLeadMapping`
2. Use saved ServiceTitan IDs already stored on the mapping:
   - `externalCrmLeadId`
   - `externalJobId`
3. Fetch current ServiceTitan lifecycle context
4. Map ServiceTitan states into partner lifecycle statuses
5. Append `CrmStatusEvent` records with `sourceSystem = CRM`
6. Update `CrmLeadMapping.lastSyncedAt`
7. Recompute `YelpLead.internalStatus` using existing regression-safe ordering

This avoids destructive rewrites and keeps the partner lifecycle history append-only.

## Required Mappings

For reliable lifecycle polling, the product needs:

- Yelp business -> internal location
- internal location -> ServiceTitan business-unit reference
- Yelp lead -> ServiceTitan lead ID and/or job ID
- service category -> ServiceTitan category/code where service-level context is relevant

If a lead has no usable ServiceTitan identifiers yet, it should remain visible as a coverage gap instead of being silently skipped.

## Sync Cadence And Lag Model

The first production-minded cadence should be:

- scheduled reconcile through the existing internal `/api/internal/reconcile` path
- a conservative due-window for mapped leads instead of polling everything on every pass
- manual “sync now” and “resync recent” controls from the Integrations screen

Initial operating assumptions:

- due refresh for active leads can be more frequent than fully closed leads
- stale coverage should surface after a missed refresh window, not immediately
- manual resync should be available for recent leads without needing direct DB edits

## Lifecycle State Mapping

The mapping should remain explicitly **partner lifecycle** logic, not Yelp-native status logic.

First supported derived statuses:

- `ACTIVE`
- `CONTACTED`
- `BOOKED`
- `SCHEDULED`
- `JOB_IN_PROGRESS`
- `COMPLETED`
- `CANCELED`
- `CLOSED_WON`
- `CLOSED_LOST`

Mapping must stay conservative:

- if ServiceTitan evidence is ambiguous, keep the latest reliable current state
- do not infer a stronger state than the upstream record safely supports
- do not overwrite Yelp-native thread state

## Failures And Staleness That Should Surface

Operators should see:

- last successful ServiceTitan lifecycle sync
- last failed lifecycle sync
- leads with resolved mapping but no downstream ServiceTitan match
- stale mappings where ServiceTitan lifecycle has not refreshed recently
- partial reconcile runs
- upstream auth / timeout / rate-limit failures

These should stay inside the existing connector surface plus the existing operator queue, not a second failure console.

## UI Changes Needed

The connector surface on `/integrations` should gain:

- lifecycle sync status
- last successful / last failed lifecycle run
- manual lifecycle sync controls
- coverage counts for mapped vs pollable vs stale leads
- recent lifecycle sync runs beside existing reference sync runs

Lead detail should gain light provenance improvements:

- clearer CRM / ServiceTitan source labeling on partner lifecycle entries where the source is connector-derived
- current sync health and staleness wording that reflects connector ownership

## Reuse vs New Work

Can be reused directly:

- `CrmLeadMapping`
- `CrmStatusEvent`
- `YelpLead.internalStatus`
- `SyncRun`
- `SyncError`
- operator issue refresh and retry flows
- connector config and auth plumbing

Must be added or refined:

- ServiceTitan lifecycle fetch methods
- connector-owned lifecycle reconcile workflow
- lifecycle poll candidate selection
- manual trigger route and form
- lifecycle sync health shaping on `/integrations`

## Manual QA Strategy

1. Configure and test the ServiceTitan connector.
2. Ensure at least one Yelp lead has a resolved CRM mapping with a real ServiceTitan lead ID or job ID.
3. Trigger a lifecycle sync from `/integrations`.
4. Confirm a `SyncRun` is created for the lifecycle poll.
5. Confirm new `CrmStatusEvent` rows are appended without duplicating old states.
6. Confirm `YelpLead.internalStatus` advances only when the fetched event is actually newer.
7. Confirm lead detail shows the connector-derived lifecycle provenance clearly.
8. Confirm `/audit` surfaces failed or stale lifecycle sync conditions when the poller cannot refresh.
9. Confirm `/integrations` shows last success, last failure, and recent lifecycle run history.

