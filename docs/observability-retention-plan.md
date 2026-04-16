# Observability And Retention Plan

## 1. What Is Currently Logged
- Core flows already emit structured logs through `logInfo` / `logError`.
- Yelp lead intake logs enqueue, processing start, completion, and failure in [features/leads/service.ts](/Users/ilias_iangurazov/Commercial/irbishvac-yelp-ads-api/features/leads/service.ts).
- Autoresponder logs duplicates, skips, sends, failures, requeues, and retry outcomes in [features/autoresponder/service.ts](/Users/ilias_iangurazov/Commercial/irbishvac-yelp-ads-api/features/autoresponder/service.ts).
- Conversation automation logs through persisted turns plus audit events, but before this pass there was no metrics rollup for decision counts or stop reasons.
- Report delivery and ServiceTitan sync paths log success/failure, but those logs were not queryable as pilot metrics.
- Internal cron routes log worker completions, limits, and failures, but route-level logs alone are not enough for pilot readiness.

## 2. What Is Currently Measurable Vs Not Measurable
- Measurable before this pass:
  - raw webhook events
  - sync run status history
  - audit events
  - lead automation attempts
  - operator issues
- Not cleanly measurable before this pass:
  - webhook intake volume over time
  - average webhook lag
  - autoresponder success/failure trends
  - bounded conversation handoff/block rates
  - issue creation rate
  - report delivery health over time
  - ServiceTitan failure trend
- The data existed, but answering those questions required scanning raw tables or logs manually.

## 3. Missing Pilot Metrics
- Webhook intake accepted vs duplicate volume.
- Webhook reconcile success/failure and queue lag.
- Initial autoresponder sent/failed/skipped.
- Follow-up sent/failed/skipped/requeued.
- Conversation decision mix:
  - auto reply
  - review only
  - human handoff
- Stop reasons:
  - low confidence
  - pricing risk
  - availability risk
  - max turn limit
  - send failure
- Issue queue growth:
  - created
  - reopened
  - auto-resolved
  - open now
- Report generation and delivery success/failure.
- ServiceTitan lifecycle/reference sync success/failure.

## 4. Where Retention Is Currently Unbounded
- `YelpWebhookEvent.payloadJson`, `headersJson`, and `errorJson`.
- `SyncRun.requestJson` and `responseJson`.
- `AuditEvent.requestSummaryJson`, `responseSummaryJson`, `beforeJson`, `afterJson`, and `rawPayloadSummaryJson`.
- `LeadConversationAutomationTurn.renderedSubject`, `renderedBody`, and `metadataJson`.
- `SyncError.detailsJson`.
- These records are useful hot, but expensive and unnecessary forever in full fidelity.

## 5. Query Paths Still Needing Attention
- `/leads` status filtering was still too dependent on runtime shaping and needed a denormalized webhook snapshot on `YelpLead`.
- Report breakdowns still pushed too much date-window filtering into memory and needed location/service filters pushed into SQL.
- Audit already had operator queue pagination, but pilot safety signals still were not visible without manual interpretation.

## 6. What Should Be Implemented First
1. Persist hourly operational rollups instead of depending on raw logs.
2. Add one compact pilot monitoring surface on existing ops UI, not a new dashboard product.
3. Add explicit retention redaction with fixed hot windows and a daily cron path.
4. Finish the `/leads` webhook-status denormalization so status filtering scales.
5. Push report breakdown location/service filters into the DB query.

## 7. Manual QA Strategy
- Trigger a few webhook deliveries and verify:
  - `OperationalMetricRollup` rows are created
  - `/audit` pilot metrics move
  - `/api/operations/metrics` returns the same summary
- Run the reconcile worker and verify webhook lag and autoresponder counts change.
- Trigger conversation handoff/review-only cases and verify stop-reason metrics and queue visibility.
- Trigger report delivery success and failure and verify pilot metrics reflect both.
- Run the retention route and verify old JSON-heavy fields are redacted rather than hard-deleted.
- Verify `/leads` status filters and report breakdown filters still return correct data after the query-path changes.
