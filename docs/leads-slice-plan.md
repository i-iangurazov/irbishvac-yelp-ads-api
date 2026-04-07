# Leads Slice Plan

## Goal
Turn the current `Leads` beta/foundation screen into the first real post-MVP operational slice:

1. receive Yelp lead webhooks,
2. persist raw deliveries,
3. normalize lead + event records,
4. show a usable lead list,
5. show a lead detail timeline with delivery/debug visibility.

This slice stays intentionally narrow. It does **not** expand CRM lifecycle work, OAuth/business-access UX, per-location reporting, or broader integrations work.

## Official Yelp docs this slice is based on

- Leads API overview: `https://docs.developer.yelp.com/docs/leads-api`
- Get Lead: `https://docs.developer.yelp.com/reference/get-lead`
- Get Lead Events: `https://docs.developer.yelp.com/reference/get-lead-events`
- Get Lead IDs for a Business: `https://docs.developer.yelp.com/reference/get-lead-ids-for-business`
- Subscribe to Webhooks: `https://docs.developer.yelp.com/reference/subscribe_to_webhooks`

## Working assumptions from the official docs

1. Yelp lead webhooks are subscription-based and currently support `leads_event`.
2. The webhook is a trigger, not the full source of truth for lead content.
3. The canonical Yelp-native timeline comes from `Get Lead` plus `Get Lead Events`.
4. Reply/read state should be derived from Yelp lead detail and event data only.
5. CRM lifecycle stages remain out of scope for this slice.
6. Yelp auth for these endpoints is bearer-token based. This repo does not yet have a dedicated OAuth/business-access operator flow, so the slice will reuse the existing runtime credential/env pattern and document that limitation clearly.

## Existing foundation to reuse

- Prisma models already exist:
  - `YelpLead`
  - `YelpLeadEvent`
  - `YelpWebhookEvent`
  - `SyncRun`
  - `SyncError`
- Existing operator patterns already exist:
  - `PageHeader`, `EmptyState`, `StatusChip`, dense `Table`
  - server-only feature services
  - `app/api` route handlers with `handleRouteError`
  - sync/audit-style visibility through `SyncRun` and `SyncError`

## Planned implementation

### 1. Yelp leads client

Add a dedicated Yelp leads client for the officially documented leads endpoints:

- `GET /v3/leads/{id}`
- `GET /v3/leads/{id}/events`
- `GET /v3/businesses/{business_id}/lead_ids` (supporting helper only; not a major UI workflow in this slice)

Implementation note:
- use bearer auth
- use the existing base-client, error normalization, and correlation logging patterns
- keep schemas permissive enough to tolerate Yelp response drift while still validating the fields the slice depends on

### 2. Webhook ingestion pipeline

Add a webhook route under `app/api` for Yelp leads deliveries.

Behavior:
- accept webhook POST deliveries
- persist raw headers + raw payload immediately into `YelpWebhookEvent`
- derive a stable idempotency key from delivery identifiers when present, otherwise from the payload shape
- create a `SyncRun` for processing
- fetch canonical Yelp lead detail + lead events from Yelp
- upsert `YelpLead`
- upsert `YelpLeadEvent` records with dedupe on `(tenantId, eventKey)`
- update `YelpWebhookEvent.status`, `processedAt`, `leadId`, and `errorJson`
- write `SyncError` rows on failure
- log structured start/success/failure events

Important honesty boundary:
- no invented webhook semantics
- no CRM stage inference
- no claim that webhook payload alone is authoritative

### 3. Lead normalization

Normalize only fields that are actually useful and supported:

- lead:
  - external lead ID
  - external Yelp business ID
  - mapped local business when possible
  - created timestamp
  - latest activity timestamp
  - customer name/email/phone if present
  - reply/read state derived from Yelp-native data
  - raw snapshot JSON
- lead event:
  - stable event key
  - external event ID if present
  - event type
  - actor type if present
  - occurred at
  - read/reply markers when inferable
  - raw payload JSON

### 4. Leads list UI

Replace the placeholder `Leads` page with a real operator list:

- columns:
  - lead ID
  - Yelp business ID / mapped business
  - created at
  - latest activity at
  - reply/read state
  - processing/sync status
- filters:
  - business
  - date range
  - status
- supporting visibility:
  - recent failed deliveries
  - recent sync errors
  - clear label that data shown is Yelp-native unless explicitly local

### 5. Lead detail UI

Add a dedicated lead detail page:

- metadata summary
- normalized event timeline in chronological order
- delivery/debug section for raw webhook deliveries
- clear split between:
  - Yelp-native fields
  - internal/local processing fields
- visible ingestion failures or partial processing problems

### 6. Tests

Add focused tests for:

- webhook idempotency
- normalization helpers
- duplicate event handling
- lead list data shaping
- lead detail timeline ordering

## Out of scope for this slice

- CRM enrichment workflows
- scheduled/job-in-progress/completed lifecycle statuses
- OAuth/business-access UX completion
- webhook subscription management UI
- reply/send actions back to Yelp
- per-location or per-service reporting
- broad integrations/dashboard redesign

## Delivery order

1. add client + schemas + repository helpers
2. add normalization + webhook processing service
3. add webhook route
4. replace leads list placeholder
5. add lead detail page
6. add tests
7. write `docs/leads-slice-summary.md`
