# Load Readiness Notes

## What Was Actually Verified

This pass did not invent fake benchmark numbers.

What was actually verified locally:

- `pnpm prisma:generate`
- `pnpm prisma:migrate:deploy`
- `pnpm test`
- `pnpm typecheck`
- `pnpm lint`
- `pnpm build`
- `pnpm load:webhooks -- --help`

What still needs a real production-like environment:

- Neon or equivalent pooled Postgres under concurrent application load
- Vercel cold starts and route concurrency
- GitHub Actions cron overlap and delay behavior
- Yelp API rate limits under bursty reconcile/backfill activity
- ServiceTitan API behavior under broader connector usage
- SMTP provider throttling and bounce handling

## Webhook Burst Simulation

Use the new helper:

```bash
pnpm load:webhooks -- \
  --url https://YOUR_MAIN_APP/api/webhooks/yelp/leads \
  --business-id YOUR_YELP_BUSINESS_ID \
  --count 100 \
  --concurrency 10 \
  --shared-secret YOUR_MAIN_PLATFORM_WEBHOOK_SHARED_SECRET
```

Notes:

- target the main app directly when testing enqueue behavior
- target the standalone webhook proxy only when you specifically want to test forwarder behavior
- use a real shared secret when the main app route requires `x-irbis-forward-secret`

What to verify:

- success and failure counts from the script output
- `SyncRun` backlog increases in a controlled way
- no duplicate webhook event rows for identical event keys
- reconcile workers drain the backlog after the burst

## Reconcile Burst / Overlap Safety

Simulate overlapping workers with two concurrent calls:

```bash
curl -sS -H "Authorization: Bearer $CRON_SECRET" \
  "https://YOUR_MAIN_APP/api/internal/reconcile?leadWebhookLimit=100&programJobLimit=0&scheduledReportLimit=0&reportLimit=0&reportDeliveryLimit=0&autoresponderFollowUpLimit=0&connectorLifecycleLimit=0"
```

Run the same call twice at nearly the same time.

What to verify:

- duplicate webhook work does not occur
- claimed runs move to `PROCESSING`
- stale `PROCESSING` work can be recovered later if a worker dies
- logs show `internal.reconcile.completed` instead of repeated worker errors

## Large Leads Pagination Checks

Use a tenant with enough leads to make pagination real.

Checks:

- open `/leads?page=1&pageSize=100`
- move across several pages
- confirm `total synced`, `filtered`, and page counts stay truthful
- repeat with a `businessId` filter
- repeat with a derived `status` filter and watch for slower response time

Expected result:

- plain paginated browsing should remain predictable
- status-filtered browsing is still the known weaker path and should be treated as a watch item

## Backfill Stress

Backfill is still a manual recovery tool, not the primary live path.

Procedure:

- enqueue recent-history backfills for 2-3 businesses
- let them run while webhook reconcile is also active
- verify each run keeps accurate progress and does not create duplicate lead rows
- watch for Yelp `429` / `5xx` responses and confirm retry behavior is bounded

What to verify:

- `YELP_LEADS_BACKFILL` runs progress cleanly
- no duplicate `YelpLead` records by `tenantId + externalLeadId`
- queue pressure does not prevent new webhook work from being claimed

## Follow-Up Worker Overlap Safety

Run the follow-up worker twice in quick succession:

```bash
curl -sS -H "Authorization: Bearer $CRON_SECRET" \
  "https://YOUR_MAIN_APP/api/internal/autoresponder/followups?limit=100"
```

What to verify:

- the same follow-up attempt is not sent twice
- due attempts move out of `PENDING`
- outside-working-hours attempts are requeued instead of dropped
- logs show bounded processed counts

## Report Generation Under Larger Data

Procedure:

- create multiple report requests across wider date windows
- run recurring schedule generation and delivery
- manually invoke reconcile while report polling is active

What to verify:

- report requests stay unique by intent
- `ReportScheduleRun` claims prevent duplicate generation/delivery work
- report list page stays responsive because it is now paginated
- report breakdown view is still the expensive path and should be tested with realistic windows

## What This Does Not Prove Yet

- true production throughput numbers
- sustainable multi-tenant burst handling over many hours
- external dependency quotas at real partner scale
- long-term storage growth behavior after months of payload accumulation

## Recommended Next Validation Step

Run a staging or production-like exercise with:

- 100-250 synthetic webhook deliveries
- concurrent reconcile invocations
- 2-3 manual backfills
- 1 report schedule generation burst
- 1 follow-up worker run

Then inspect:

- queue lag
- failed dependency calls
- page responsiveness on `/leads`, `/audit`, `/reporting`, and `/integrations`
- database growth and index usage
