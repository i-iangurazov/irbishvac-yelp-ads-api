# Production Operations Runbook

## Deployment Checks

Before deploying:

- confirm production env vars are present and current
- confirm GitHub Actions secrets for cron routes are present and match production
- confirm the `Production Readiness` GitHub Actions workflow passed for the exact commit being deployed
- run:

```bash
VERIFY_POSTGRES_URL=postgresql://postgres:postgres@localhost:5432/postgres?sslmode=disable \
VERIFY_RUN_SEED=1 \
pnpm release:verify
```

If local Postgres is unavailable, run the non-migration gate and rely on GitHub Actions for disposable Postgres migration verification:

```bash
pnpm prisma:generate
pnpm test
pnpm typecheck
pnpm lint
pnpm build
```

After deploying:

- verify the app booted cleanly
- verify the latest migration is present in the production database
- verify the webhook proxy still forwards to the correct main app URL

## Migration Checks

Required checks:

- `DATABASE_URL` points at the intended production database
- the app and migration runner use the same Prisma schema
- the latest migration in this pass is `0018_side_effect_idempotency`
- `.github/workflows/production-readiness.yml` passes disposable Postgres migration verification

Operational rule:

- never skip migration verification just because build passed
- if migration fails, stop rollout and fix the database/runtime mismatch first

## Webhook Verification

If using the standalone webhook proxy:

- verify `GET https://YOUR_WEBHOOK_PROXY/api/webhooks/yelp/leads?verification=test123`
- expected result: plain `test123`

To verify direct main-app intake:

```bash
pnpm load:webhooks -- \
  --url https://YOUR_MAIN_APP/api/webhooks/yelp/leads \
  --business-id YOUR_YELP_BUSINESS_ID \
  --count 5 \
  --concurrency 2 \
  --shared-secret YOUR_MAIN_PLATFORM_WEBHOOK_SHARED_SECRET
```

What to confirm:

- webhook POSTs return `202`
- new `YELP_LEADS_WEBHOOK` runs appear
- reconcile drains the queued work
- issue queue stays clean unless the dependency call actually fails

## Worker / Cron Verification

Required GitHub Actions secrets:

- `RECONCILE_URL`
- `AUTORESPONDER_FOLLOWUPS_URL`
- `CRON_SECRET`

Required app env:

- `CRON_SECRET`
- optional `OPERATIONS_ALERT_WEBHOOK_URL`
- optional `OPERATIONS_ALERT_WEBHOOK_SECRET`

Manual reconcile check:

```bash
curl -sS -H "Authorization: Bearer $CRON_SECRET" \
  "https://YOUR_MAIN_APP/api/internal/reconcile"
```

Manual follow-up check:

```bash
curl -sS -H "Authorization: Bearer $CRON_SECRET" \
  "https://YOUR_MAIN_APP/api/internal/autoresponder/followups?limit=50"
```

Manual operational canary check:

```bash
curl -sS -H "Authorization: Bearer $CRON_SECRET" \
  "https://YOUR_MAIN_APP/api/internal/operations/canary"
```

Manual alert evaluation:

```bash
curl -sS -H "Authorization: Bearer $CRON_SECRET" \
  "https://YOUR_MAIN_APP/api/internal/operations/alerts"
```

Dispatch alert digest when `OPERATIONS_ALERT_WEBHOOK_URL` is configured:

```bash
curl -sS -H "Authorization: Bearer $CRON_SECRET" \
  "https://YOUR_MAIN_APP/api/internal/operations/alerts?dispatch=1"
```

Safe webhook echo canary:

```bash
curl -sS -H "Authorization: Bearer $CRON_SECRET" \
  "https://YOUR_MAIN_APP/api/internal/operations/canary?http=1"
```

What to confirm:

- `internal.reconcile.completed` logs appear
- `internal.autoresponder_followups.completed` logs appear
- `internal.operations.canary.completed` logs appear
- `internal.operations.alerts.completed` logs appear
- backlog counts move down, not only up

## Kill Switch Usage

Fastest safe controls:

- tenant defaults `isEnabled = false` stops baseline autoresponder behavior
- remove a business from tenant-default coverage if only one business is misbehaving
- set a business override `isEnabled = false` to shut off automation for that business
- use conversation `review-only` mode when replies should be drafted but not auto-sent
- use `conversationGlobalPauseEnabled = true` to stop bounded conversation auto-replies without tearing down the rest of the module

Operational rule:

- prefer narrowing scope first
- only use tenant-wide disable when business-scoped controls are not enough

## Issue Queue Review

Review `/audit` and the linked issue detail pages for:

- lead sync failures
- CRM sync failures
- autoresponder failures
- report delivery failures
- stale lead / unmapped lead pressure

Use `/audit` > Webhook and reconcile drilldown for:

- stale queued webhook events
- processing webhook events older than 10 minutes
- failed or partial webhook reconciles
- event key and delivery ID lookup
- linked lead and business impact
- sync run error summaries

Triage order:

- open high severity issues first
- retry only issues with a safe retry path
- resolve only when the underlying state is actually corrected

## External Dependency Failure Handling

### Yelp API

Look for:

- `429`
- `5xx`
- growing `YELP_LEADS_WEBHOOK` or reporting backlog

Action:

- reduce manual backfill pressure
- keep reconcile running
- do not keep hammering retry loops manually

### ServiceTitan

Look for:

- auth failures
- stale lifecycle syncs
- connector mapping drift

Action:

- verify credential health
- verify connector environment and tenant/app keys
- treat connector-wide failures as integration incidents, not per-lead defects

### SMTP

Look for:

- report delivery failures
- invalid recipients
- provider throttling

Action:

- fix recipient lists first
- then retry failed delivery runs
- if a duplicate delivery was suppressed, inspect `ExternalSideEffect` for the matching report run before forcing another manual send

### OpenAI

Look for:

- increased latency on AI-assisted draft flows
- higher failure counts on AI-generated replies or summaries

Action:

- fall back to deterministic messaging where already built
- do not broaden AI-enabled scope during an active provider issue

## Idempotency And Provider Budgets

Customer-visible send paths create `ExternalSideEffect` rows keyed by operation.

Covered paths:

- Yelp thread lead replies
- Yelp masked-email lead replies
- automated initial and follow-up sends
- bounded conversation auto-replies
- scheduled report delivery emails

Operational rules:

- a `SUCCEEDED` side-effect record means replay should not send again
- a `CLAIMED` side-effect record means a matching send is in progress or stale
- a `FAILED` side-effect record may be reclaimed by retry, but confirm whether the provider may have accepted the request before forcing repeated sends

Provider budgets are lightweight hourly guardrails for Yelp, SMTP, OpenAI, and ServiceTitan-style integrations where wired.

If a provider budget is exceeded:

- stop manual retry pressure
- check provider health and open issues
- wait for the next hourly bucket or narrow the workload
- do not broaden automation scope during budget pressure

## Worker Durability

Cron routes now create durable `WorkerJob` records for reconcile, follow-ups, retention, and alert evaluation.

Operational rules:

- `CLAIMED` or `PROCESSING` means a worker owns an active lease
- a second overlapping cron call should skip the leased worker instead of running duplicate work
- `FAILED` means the worker is in bounded backoff and can retry later
- `DEAD_LETTERED` means the worker exhausted its retry budget and will not keep running

When work is not draining:

- open Audit and check `Worker durability`
- inspect the failed or dead-lettered worker key
- compare the last error summary with provider health and recent deploys
- do not repeatedly hammer the route if the job is already dead-lettered
- fix the underlying dependency/config/data issue before manually requeueing in the database

Current limitation: there is no safe in-app requeue button yet. Treat dead-letter requeue as an operator/developer action, not a routine click.

## Pilot To Broader Rollout Guidance

Safe rollout sequence:

- start with a small business set
- keep conversation automation conservative
- watch queue lag and issue growth for several days
- only widen to more businesses after webhook backlog, report delivery, and issue queue remain stable

Do not broaden rollout if:

- webhook backlog keeps growing
- status-filtered lead views are already slow for operators
- report detail generation becomes painful on normal business windows
- connector failures are frequent enough to flood the issue queue
