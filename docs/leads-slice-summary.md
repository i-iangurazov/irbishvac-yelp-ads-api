# Leads Slice Summary

## What was implemented

### 1. Webhook ingestion

- Added a public Yelp leads webhook route at `app/api/webhooks/yelp/leads/route.ts`
- Implemented Yelp webhook verification handling via `GET ?verification=...`
- Implemented `POST` ingestion for Yelp `leads_event` payloads
- Persisted raw webhook headers and payloads in `YelpWebhookEvent`
- Persisted processing state, timestamps, and failure details
- Added `SyncRun` + `SyncError` tracking for lead webhook processing

### 2. Yelp-native normalization

- Added a dedicated Yelp leads client for:
  - `Get Lead`
  - `Get Lead Events`
  - `Get Lead IDs for a Business` helper
- Normalized webhook-triggered lead records into:
  - `YelpLead`
  - `YelpLeadEvent`
- Derived reply/read state from Yelp-native lead + event data
- Preserved raw Yelp lead payloads for debugging

### 3. Idempotency and duplicate handling

- Added stable webhook event keys for repeated deliveries
- Added stable lead event keys for repeated Yelp event payloads
- Duplicate deliveries do not create duplicate lead or lead-event records
- If a webhook previously failed, a repeated delivery reprocesses safely against the same webhook event key

### 4. Leads operator UI

- Replaced the placeholder `Leads` page with a real operator list
- Added filters for:
  - business
  - date range
  - ingestion status
- Added list columns for:
  - lead ID
  - Yelp business ID / mapped business
  - created at
  - latest activity at
  - reply/read state
  - ingestion status
- Added recent failure visibility on the list page

### 5. Lead detail

- Added `app/(console)/leads/[leadId]/page.tsx`
- Shows:
  - lead metadata
  - normalized event timeline in chronological order
  - webhook delivery history
  - source-of-truth boundaries
  - raw lead snapshot
  - raw webhook payload / headers / error block

### 6. Tests

- Added tests for:
  - webhook idempotency keys
  - normalization logic
  - duplicate event handling
  - lead list shaping
  - lead detail timeline ordering
  - webhook route verification and POST handling

## What remains out of scope

- CRM lifecycle stages such as Scheduled / Job in Progress / Completed
- OAuth/business-access operator UX
- webhook subscription management UI
- lead reply actions back to Yelp
- backfill UI for lead IDs by business
- per-location or per-service reporting
- broader integrations work outside this slice

## Assumptions made

1. This slice follows Yelp’s official Leads docs:
   - Leads API overview
   - Get Lead
   - Get Lead Events
   - Get Lead IDs for a Business
   - Leads Webhooks
2. The webhook is treated as a trigger, not the full lead source of truth.
3. The canonical lead timeline is fetched from Yelp after webhook receipt.
4. The current repo does not yet have a dedicated OAuth/business-access admin flow for Leads API access.
   - The slice therefore reuses the existing bearer-token runtime path for Yelp reads.
5. Tenant resolution for public webhook deliveries is based on a saved Yelp business mapping when available, otherwise the default tenant fallback is used.
   - This is acceptable for the current internal MVP shape, but it is not a complete multi-tenant webhook routing strategy.
6. Yelp does not document a webhook signature scheme on the Leads webhook docs used here.
   - The slice therefore stores delivery metadata and supports allowlisting/IP verification operationally outside the app, rather than claiming in-app signature verification that is not documented.

## Manual test flow

### 1. Verify the endpoint

- `GET /api/webhooks/yelp/leads?verification=test-token`
- Expected:
  - `200`
  - JSON response contains `{ "verification": "test-token" }`

### 2. Post a Yelp-style webhook payload

- Send a `POST` to `/api/webhooks/yelp/leads` with a body shaped like the Yelp Leads Webhooks docs:

```json
{
  "time": "2026-04-01T09:00:00+00:00",
  "object": "business",
  "data": {
    "id": "YOUR_YELP_BUSINESS_ID",
    "updates": [
      {
        "event_type": "NEW_EVENT",
        "event_id": "evt_123",
        "lead_id": "lead_123",
        "interaction_time": "2026-04-01T09:00:00+00:00"
      }
    ]
  }
}
```

- Expected:
  - raw delivery stored in `YelpWebhookEvent`
  - `SyncRun` created
  - `YelpLead` upserted
  - `YelpLeadEvent` rows upserted

### 3. Confirm the list page

- Open `/leads`
- Expected:
  - the lead appears in the table
  - reply/read state is visible
  - mapped business is shown if the Yelp business is already saved locally
  - ingestion status is visible

### 4. Confirm the detail page

- Open `/leads/{localLeadId}`
- Expected:
  - metadata is populated
  - event timeline is chronological
  - raw delivery/debug block is visible
  - source boundaries clearly distinguish Yelp-native vs local processing data

### 5. Confirm duplicate safety

- Send the same webhook payload again
- Expected:
  - no duplicate `YelpLead` record
  - no duplicate `YelpLeadEvent` rows
  - delivery is treated as duplicate or safe retry

### 6. Confirm failure visibility

- Disable the Yelp bearer token or force the Yelp read to fail, then post a webhook
- Expected:
  - raw webhook delivery still exists
  - webhook status becomes `FAILED`
  - `SyncRun` is marked failed
  - `SyncError` is created
  - `/leads` shows the failure in the recent failure section
