# Worker Durability Summary

## What Changed

Internal cron workers now run through a lightweight durable worker job layer.

Covered jobs:

- internal reconcile program jobs
- internal reconcile Yelp lead webhooks
- internal reconcile scheduled reports
- internal reconcile pending reports
- internal reconcile report deliveries
- internal reconcile autoresponder follow-ups
- internal reconcile ServiceTitan lifecycle syncs
- dedicated autoresponder follow-up worker
- operational retention worker
- operational alert evaluation worker

This is not a separate queue platform. It is a DB-backed lease, retry, and dead-letter foundation for the current cron/HTTP worker architecture.

## New Worker Job State

Each worker key stores:

- worker kind and stable job key
- current status
- current attempt count and max attempts
- claim owner and lease expiry
- last payload, result, and error summary
- dead-letter timestamp when repeated failures exhaust the retry budget

Statuses:

- `QUEUED`
- `CLAIMED`
- `PROCESSING`
- `SUCCEEDED`
- `FAILED`
- `DEAD_LETTERED`
- `SKIPPED`

## Overlap Protection

When a cron route starts, each worker attempts to claim its stable job key.

If another run already owns an unexpired lease, the worker is skipped instead of running twice.

If a previous worker lease expired, a later cron run can reclaim it.

This reduces overlapping-worker risk without changing the underlying business logic.

## Retry And Dead-Letter Behavior

Failed jobs get bounded exponential backoff.

After the configured attempt limit, the job becomes `DEAD_LETTERED` and stops running until an operator/developer intervenes.

The current default is three attempts.

## Operator Visibility

Audit now includes a `Worker durability` section showing:

- active workers
- queued jobs
- failed jobs
- dead-lettered jobs
- recent worker keys
- last error summaries

This gives operators a concrete place to check when cron appears healthy but work is not draining.

## Remaining Limitations

- This is still not a high-throughput queue worker system.
- There is no in-app retry/requeue action yet for dead-lettered worker jobs.
- Worker jobs are app-level for current cron routes, not per-tenant work queues.
- External monitoring should still be added for production alerting outside the app.

## Manual QA

1. Run `pnpm prisma:generate`.
2. Apply migrations to a disposable database with `pnpm prisma:migrate:deploy`.
3. Start the app and trigger `/api/internal/reconcile` with a valid `CRON_SECRET`.
4. Confirm the response includes `workerJobs`.
5. Trigger the route twice quickly and confirm the second run skips any still-leased worker instead of duplicating execution.
6. Force a worker failure in a safe local environment and rerun until attempts reach the limit.
7. Confirm the worker job changes to `DEAD_LETTERED`.
8. Open `/audit` and confirm the Worker durability section shows failed or dead-lettered jobs.
