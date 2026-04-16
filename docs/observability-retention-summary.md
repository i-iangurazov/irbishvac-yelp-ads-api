# Observability And Retention Summary

## 1. What Metrics Are Now Available
- Persisted hourly operational rollups now exist in `OperationalMetricRollup`.
- Core tracked metrics now include:
  - webhook intake accepted / duplicate / lag
  - webhook reconcile success / failure / processing lag
  - initial autoresponder sent / failed / skipped
  - follow-up sent / failed / skipped / requeued
  - conversation decision mix and stop reasons
  - operator issue created / reopened / auto-resolved / open gauge
  - report generation success / failure
  - report delivery success / failure
  - ServiceTitan lifecycle/reference success / failure
- Metrics are available through:
  - the compact pilot section on [audit/page.tsx](/Users/ilias_iangurazov/Commercial/irbishvac-yelp-ads-api/app/(console)/audit/page.tsx)
  - the JSON route [metrics/route.ts](/Users/ilias_iangurazov/Commercial/irbishvac-yelp-ads-api/app/api/operations/metrics/route.ts)
- Alert evaluation is available through:
  - the internal cron route [alerts/route.ts](/Users/ilias_iangurazov/Commercial/irbishvac-yelp-ads-api/app/api/internal/operations/alerts/route.ts)
  - optional digest dispatch to `OPERATIONS_ALERT_WEBHOOK_URL`

## 2. What Retention Rules Now Exist
- Retention is now redaction-based, not silent row deletion.
- Hot windows:
  - webhook payload/debug: 30 days
  - sync run request/response debug: 45 days
  - audit raw payload summary: 30 days
  - audit before/after/request/response debug: 90 days
  - conversation rendered content + metadata: 90 days
  - sync error details: 60 days
- The runner is [retention-service.ts](/Users/ilias_iangurazov/Commercial/irbishvac-yelp-ads-api/features/operations/retention-service.ts).
- The internal cron route is [retention/route.ts](/Users/ilias_iangurazov/Commercial/irbishvac-yelp-ads-api/app/api/internal/operations/retention/route.ts).
- The scheduled workflow is [retention.yml](/Users/ilias_iangurazov/Commercial/irbishvac-yelp-ads-api/.github/workflows/retention.yml).

## 3. What Pilot Visibility Improved
- `/audit` now shows a compact pilot monitoring block with:
  - webhook volume
  - webhook lag
  - automation sent / failed
  - conversation handoffs
  - issue growth
  - report delivery health
  - business-level rollout posture
- `/audit` also shows a webhook/reconcile drilldown with:
  - queued/processing/failed/completed counts
  - oldest pending webhook age
  - stale, failed, and partial webhook events
  - linked business, lead, event key, sync run, and error summary
- Business posture now shows which businesses are:
  - off
  - paused
  - need setup
  - need attention
  - in review pilot
  - in limited auto-reply
  - already showing proof of send

## 4. What Remains Unresolved
- This is still a lightweight operational metrics layer, not a full time-series backend.
- Rollups are hourly and tenant-scoped. There is still no external metrics sink like Prometheus, Datadog, or Grafana.
- Alert dispatch is a generic webhook digest, not a full incident management integration.
- Retention redacts heavy JSON/debug artifacts, but it does not yet archive them externally before redaction.
- Some broader operational pages are still heavier than ideal under very large row counts, especially full report detail and integrations-heavy views.
- Audit/pilot visibility is materially better, but cross-tenant fleet-wide monitoring is still out of scope.

## 5. Exact Manual QA Steps
1. Run `pnpm prisma:migrate:deploy` and `pnpm prisma:generate`.
2. Trigger a webhook enqueue and reconcile cycle.
3. Open `/audit` and confirm the pilot cards update:
   - webhook volume
   - webhook lag
   - automation sent / failed
4. Hit `GET /api/operations/metrics` as an authenticated audit-capable user and confirm the JSON summary matches the audit page.
5. Trigger:
   - one autoresponder success
   - one autoresponder failure
   - one conversation handoff
   - one report delivery failure
   - one ServiceTitan failure
   Then confirm the related metric counters move.
6. Run the retention route with cron auth:
   - `GET /api/internal/operations/retention?limit=250`
   Confirm the response contains redaction counts.
7. Inspect older rows in:
   - `YelpWebhookEvent`
   - `SyncRun`
   - `AuditEvent`
   - `LeadConversationAutomationTurn`
   - `SyncError`
   Confirm the row remains but heavy JSON/debug fields are redacted or nulled according to policy.
8. Verify `/leads` status filters still return correct totals and page rows.
9. Verify report breakdowns still return correct results with location/service filters applied.
10. Open `/audit` and confirm Webhook and reconcile drilldown surfaces stale or failed webhook events with enough detail to recover.
11. Run `GET /api/internal/operations/alerts` with cron auth and confirm it returns `OK`, `WARN`, or `CRITICAL`.
12. Configure `OPERATIONS_ALERT_WEBHOOK_URL`, create a threshold breach, run `GET /api/internal/operations/alerts?dispatch=1`, and confirm a digest is sent.

## PR-Style Summary
- Rollout control changes: none added beyond safer pilot visibility; this pass focused on observability and retention, not new automation behavior.
- Analytics changes: added persisted hourly rollups plus pilot monitoring summary and metrics API route.
- Queue/review changes: operator queue growth is now measured and surfaced alongside pilot metrics.
- Persistence changes: added explicit redaction-based retention for heavy payload/debug fields and a daily retention workflow.
- Remaining limitations: no external metrics backend, generic alert webhook only, no archive sink, and some broader surfaces still need real high-volume validation.
