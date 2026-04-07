# CRM Enrichment Plan

## Current Gaps

- The leads slice currently stops at Yelp-native ingestion. `YelpLead` and `YelpLeadEvent` are operational, but CRM mapping and downstream status tracking are not surfaced.
- The schema has `CrmLeadMapping` and `CrmStatusEvent`, but the current shape is not sufficient for operator workflows:
  - `CrmLeadMapping` assumes a resolved external CRM lead ID and a `matchedAt` timestamp.
  - unresolved, manual override, conflict, and error states are not first-class
  - mapping freshness and sync problem visibility are missing
- `YelpLead.internalStatus` exists, but it is only set to `UNMAPPED` during Yelp ingestion and is never updated from internal CRM events.
- Lead list and detail pages only show Yelp-native activity plus local webhook processing. They do not distinguish CRM-owned lifecycle state from Yelp-owned events.
- Reporting only aggregates Yelp reporting payloads. There is no backend foundation for derived conversion metrics from CRM status history.

## Proposed Model Changes

### Enums

- Add `CrmLeadMappingState`:
  - `UNRESOLVED`
  - `MATCHED`
  - `MANUAL_OVERRIDE`
  - `CONFLICT`
  - `ERROR`
- Expand `InternalLeadStatus` with statuses the product brief calls for:
  - `CONTACTED`
  - `CLOSED_WON`
  - `CLOSED_LOST`
- Keep existing internal statuses instead of renaming them, to avoid churn in existing data and tests.

### `CrmLeadMapping`

- Make `externalCrmLeadId` nullable so unresolved/conflict/error rows can exist without inventing an internal match.
- Make `matchedAt` nullable so only resolved mappings claim a match timestamp.
- Add:
  - `state CrmLeadMappingState`
  - `issueSummary String?`
  - `lastSyncedAt DateTime?`
- Preserve:
  - `sourceSystem`
  - raw snapshot storage
  - metadata JSON for future ServiceTitan-style extension
- Keep one active mapping row per Yelp lead for this slice by preserving `@@unique([leadId])`.

### `CrmStatusEvent`

- Reuse the current model for internal lifecycle history.
- Continue storing internal status payloads separately from Yelp lead events.
- Use `sourceSystem = CRM` for synced data and `sourceSystem = INTERNAL` for explicit manual override entries when needed.

## Mapping Approach

### Scope

- This slice is not a full CRM sync product.
- It introduces a narrow, trustworthy mapping workflow:
  - a Yelp lead can remain unresolved
  - an operator can attach or override a CRM mapping
  - internal CRM statuses can be stored as a separate timeline
  - conflicts and failures are visible

### Service Design

- Add a CRM enrichment feature service that owns:
  - mapping state normalization
  - manual mapping upsert
  - internal status event append/upsert
  - lead-level exception summaries
  - conversion metric aggregation
- Keep Yelp ingestion untouched except for preserving compatibility with the new mapping/status view models.
- Update `YelpLead.internalStatus` from the latest internal status event, but do not merge CRM events into the Yelp-native timeline.

### Operator Actions

- Add a small manual CRM mapping action on lead detail:
  - unresolved -> matched
  - matched -> manual override
  - conflict/error -> corrected manually
- Add a compact internal status update action on lead detail for controlled operator/admin use.
- Record audit events for both actions.

## Sync Assumptions

- Real CRM automation is still out of scope for this slice.
- The slice will use local/internal records to represent CRM matches and lifecycle updates, while keeping source attribution explicit:
  - synced CRM records use `CRM`
  - operator-entered corrections use `INTERNAL`
- Use `SyncRun` and `SyncError` with `CRM_LEAD_ENRICHMENT` for failed enrichment attempts and stale/problem states.
- A mapping is considered stale when it exists but has no recent CRM sync marker. This will be expressed conservatively in the UI, not as a hidden heuristic.

## Operator UX Changes

### Leads List

- Keep the existing list page and add:
  - current mapping state
  - current internal status
  - concise exception indicators for unmapped, stale, conflict, and failed CRM sync
- Expand filters to include CRM mapping/status views without removing the existing Yelp ingestion filters.

### Lead Detail

- Keep the current Yelp-native timeline intact.
- Add separate blocks for:
  - current CRM mapping state
  - CRM/internal status timeline
  - CRM sync health and mapping issues
  - raw CRM/local debug data where available
- Preserve the existing source-boundary messaging and make it stronger:
  - Yelp timeline stays Yelp-owned
  - CRM/internal timeline stays separate

### Reporting Foundation

- Add backend aggregation helpers only, not a new reporting surface.
- Derived metrics for this slice:
  - total Yelp leads
  - mapped leads
  - booked leads
  - scheduled jobs
  - completed jobs
  - close rate
- These metrics will be labeled as internal-derived so they cannot be confused with Yelp reporting snapshots.

## Out of Scope

- OAuth or business-access work
- per-location or per-service reporting UI
- automated CRM polling or ServiceTitan API integration
- reply actions back to Yelp
- broad redesign of the console
