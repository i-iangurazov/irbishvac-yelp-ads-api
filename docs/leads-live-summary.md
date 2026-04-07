# Leads Live Summary

## What is now live

- Yelp webhook intake at `/api/webhooks/yelp/leads`
- Manual Yelp history import at `/api/leads/sync`
- Raw payload persistence in `YelpWebhookEvent`
- Normalized `YelpLead` and `YelpLeadEvent` storage
- Idempotent duplicate handling for deliveries and events
- Dense operator queue at `/leads`
- Real lead detail at `/leads/[leadId]`
- Sync and failure visibility through `SyncRun`, `SyncError`, and `/audit`

## What operators can do

- import saved lead history for a business
- inspect normalized Yelp lead timelines
- confirm whether a lead came from webhook delivery or manual import
- review recent intake failures without dropping into the database

## What remains out of scope

- replying back to Yelp from the console
- in-product webhook subscription management
- full OAuth/business-access management

## Assumptions

- Leads access is provided through the bearer token path, not Ads basic auth.
- Yelp lead import uses the returned `lead_ids` page honestly and surfaces `has_more` when the upstream response is incomplete.

## Manual QA

1. Save a bearer token in Settings.
2. Open `/leads`.
3. Run `Sync Yelp leads` for a saved business.
4. Confirm queue rows appear with Yelp and internal status separation.
5. Open a lead detail page and confirm:
   - Yelp timeline exists
   - webhook/import history is visible
   - raw payload/debug blocks are available
6. Re-run the import and confirm records update without duplicates.
