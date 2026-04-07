# CRM Sync Plan

## Goal

Track what happened to a Yelp lead after intake without rewriting Yelp history.

## Current gaps

- Yelp provides lead-side events, not downstream operational outcomes.
- Internal lifecycle needs its own timeline and mapping state.
- Operators need a visible unresolved and conflict path instead of silent null states.

## Implementation approach

### Mapping layer

- Use `CrmLeadMapping` as the durable lead-to-internal-entity link.
- Support:
  - `UNRESOLVED`
  - `MATCHED`
  - `MANUAL_OVERRIDE`
  - `CONFLICT`
  - `ERROR`
- Preserve timestamps, source system, and issue summary.

### Internal lifecycle

- Append lifecycle changes into `CrmStatusEvent`.
- Keep `YelpLead.internalStatus` as the current summary only.
- Never merge these rows into the Yelp-native timeline.

### API and UI

- Reuse authenticated internal routes:
  - `/api/leads/[leadId]/crm-mapping`
  - `/api/leads/[leadId]/crm-statuses`
- Show mapping state, CRM health, and lifecycle status directly on the lead queue and lead detail pages.

## Operator truth rules

- CRM/internal statuses are never labeled as Yelp data.
- Manual overrides remain explicit.
- Conflicts and stale states must remain visible until resolved.

## Tests

- mapping state coercion
- conflict detection
- status timeline ordering
- separation of Yelp and internal data

## Known limits

- The repo exposes authenticated internal write routes, but not a separate connector daemon.
- There is no automatic CRM polling loop in this codebase yet.
