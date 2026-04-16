# Production Scale Summary

## Biggest Bottlenecks Found

- `/leads` derived status filtering still does an in-memory pass after the base query
- report breakdown generation still scales with the full selected lead window
- operational JSON payload tables have no retention or archival policy
- cron-driven worker drains can still become a throughput ceiling during sustained bursts
- integrations overview still loads more connector data than it should for large catalogs

## What Was Optimized

### DB / Query Changes

- added operational indexes for webhook events, sync runs, operator issues, report schedule runs, automation attempts, audit events, and lead recency lookups
- paginated the reporting index and replaced full report hydration with a summary query
- paginated the operator queue and replaced summary-from-full-list behavior with targeted count queries

### Job / Worker Hardening

- webhook reconcile now claims sync runs explicitly and can recover stale `PROCESSING` work
- webhook selection now favors newer work so fresh traffic is not buried behind old backlog
- report schedule generation and delivery now claim pending runs before processing
- operator issue refresh now uses a short lease instead of refreshing on every page load

### Rate-Limit / Retry Changes

- shared fetch retry now respects `Retry-After`
- backoff now uses jitter to reduce synchronized retries
- retry behavior stays bounded instead of spiking external dependencies harder

### Page / Server Performance Changes

- reporting list view is now lighter and page-based
- audit/operator queue no longer forces a full issue refresh on every read
- issue list shaping is narrower and page-based instead of loading the full queue

### Observability Changes

- structured log timestamps are now emitted consistently
- internal reconcile and follow-up routes now log completion/failure summaries
- a reusable webhook burst simulator was added for readiness testing

## What Risks Were Reduced

- duplicate webhook work under overlapping reconcile runs
- duplicate report schedule generation and delivery work
- operator queue read amplification
- report list overfetch
- retry storms against Yelp / ServiceTitan / OpenAI / SMTP-dependent routes

## What Remains Unresolved

- lead status filtering is still not fully database-driven
- report breakdowns still perform full-window aggregation
- integrations overview is still too broad for large catalogs
- no archival or retention policy exists for JSON-heavy audit and payload tables
- no durable metrics backend exists yet
- the architecture is still cron-and-HTTP-worker based rather than queue-daemon based

## What Still Needs Real Environment Validation

- real pooled Postgres behavior under concurrent route load
- Vercel cold start and route concurrency under webhook bursts
- GitHub Actions schedule overlap and drift
- Yelp API rate limits under real burst conditions
- ServiceTitan connector behavior under sustained lifecycle sync pressure
- SMTP provider throttling

## Exact Manual QA Steps

1. Run:

```bash
pnpm prisma:generate
pnpm prisma:migrate:deploy
pnpm test
pnpm typecheck
pnpm lint
pnpm build
```

2. Simulate webhook burst intake:

```bash
pnpm load:webhooks -- \
  --url https://YOUR_MAIN_APP/api/webhooks/yelp/leads \
  --business-id YOUR_YELP_BUSINESS_ID \
  --count 100 \
  --concurrency 10 \
  --shared-secret YOUR_MAIN_PLATFORM_WEBHOOK_SHARED_SECRET
```

3. Run overlapping reconcile calls with the same `CRON_SECRET` and confirm queue claims prevent duplicate processing.

4. Open `/leads` and test:

- page navigation
- larger `pageSize`
- business filtering
- derived status filtering

5. Open `/audit` and verify:

- operator queue pagination
- summary counts
- no repeated full-refresh behavior on each reload

6. Open `/reporting` and verify:

- list pagination
- summary counts
- recent runs remain responsive

7. Trigger a manual backfill and confirm:

- progress updates remain truthful
- reconcile continues draining webhook work
- no duplicate lead creation occurs

8. Trigger the follow-up worker twice and confirm:

- no duplicate sends
- due items move out of pending state

## Blunt Readiness Judgment

**Controlled pilot ready.**

This pass makes the system materially safer for higher request volume and more operators. The repo is stronger on claims, retries, list shaping, and worker overlap than it was before.

It is **not yet ready for materially higher scale without more work** on:

- database-driven derived lead filtering
- report breakdown cost control
- payload retention / archival
- broader metrics and backlog visibility

## PR-Style Summary

- DB/query changes: added missing operational indexes, paginated reporting, paginated operator queue, and narrowed summary queries
- job/worker hardening: added claims and stale recovery for webhook and report-delivery work, plus safer issue refresh behavior
- rate-limit/retry changes: shared fetch now uses bounded jittered backoff and honors `Retry-After`
- page/server performance changes: reduced overfetch on reporting and audit/operator surfaces
- observability changes: added structured worker logs and a webhook burst simulation helper
- remaining risks: leads status filtering, report breakdown aggregation, JSON retention, integrations breadth, and cron-based drain limits
