# Leads Live Plan

## Goal

Make `/leads` a real live operator module driven by actual Yelp intake rather than placeholder rows.

## Current gaps

- Webhooks alone are not enough because historical leads may already exist on Yelp.
- Operators need a visible import path and a trustworthy sync summary.
- Lead detail must show raw deliveries, normalized events, and ingestion failures without mixing them together.

## Implementation approach

### Intake paths

- Keep webhook ingestion at `/api/webhooks/yelp/leads`.
- Add manual import at `/api/leads/sync` using:
  - `GET /v3/businesses/{business_id}/lead_ids`
  - `GET /v3/leads/{lead_id}`
  - `GET /v3/leads/{lead_id}/events`

### Storage

- Persist raw webhook payloads in `YelpWebhookEvent`.
- Persist normalized leads in `YelpLead`.
- Persist normalized Yelp timeline rows in `YelpLeadEvent`.
- Persist processing state and failures in `SyncRun` and `SyncError`.

### Idempotency

- Deduplicate webhook deliveries by stable event key.
- Deduplicate normalized lead events by stable event key.
- Treat repeated imports as upserts, not inserts.

### UI

- Replace placeholder lead queue behavior with:
  - real lead list
  - business/date/status filters
  - last sync visibility
  - failure visibility
- Upgrade lead detail to show:
  - lead summary
  - Yelp timeline
  - webhook delivery history
  - raw snapshot/debug blocks
  - internal and automation sections as separate overlays

## Operator truth rules

- Yelp-native data stays on the Yelp timeline only.
- Imported leads must not read like webhook failures.
- Manual import limits must be stated honestly when Yelp returns `has_more`.

## Tests

- webhook idempotency
- import dedupe
- normalization correctness
- lead list shaping
- detail timeline ordering

## Known limits

- Public webhook delivery still depends on deployment and Yelp-side subscription setup.
- The repo does not invent pagination behavior beyond what Yelp currently returns from `lead_ids`.
