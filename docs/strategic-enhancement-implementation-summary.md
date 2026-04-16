# Strategic Enhancement Implementation Summary

## Implemented Slices

### Slice 1: Yelp Connection and Business Automation Posture

The first pass implemented the first production-critical slice from the Strategic Enhancement Plan:

- stronger per-business Yelp connection visibility
- clearer separation between Yelp intake health and autoresponder send readiness
- improved lead-detail visibility for Yelp delivery proof
- more explicit business automation posture in the Autoresponder module

That slice started the plan in the highest-leverage area: proving whether each Yelp business is actually connected and operational.

### Slice 2: AI Conversation Trust

The second pass implemented the next highest-value product trust slice:

- richer persisted conversation decision metadata
- clearer AI/template/prompt traceability on lead detail
- review-only conversation suggestions that can be copied into the reply composer
- edit tracking through the existing AI draft send metadata path

This makes bounded conversation automation easier to inspect without adding a new chatbot surface or widening AI autonomy.

### Slice 3: Business And Program Control

The third pass implemented the next strategic UX/control slice:

- business detail now has one operational posture summary for Yelp connection, automation, conversation mode, programs, ServiceTitan mapping, reports, and open issues
- program detail now has one operational posture summary for local status, budget, active features, latest Yelp job, business/location mapping, and business automation
- business and program pages now show explicit operator warnings when control is incomplete
- the pages use existing records and settings only; no new product module or workflow was added

This makes business and program state easier to trust without forcing operators to piece together posture from several unrelated cards.

### Slice 4: Webhook Drilldown And Alerting Foundation

The fourth pass implemented the next production-operations slice:

- Audit now includes a webhook/reconcile drilldown for stale, failed, and partial Yelp webhook events
- operators can see event key, delivery ID, business, linked lead, webhook status, sync run status, and error summary
- a cron-protected alert evaluator now checks pilot thresholds for webhook backlog, webhook failures, autoresponder failures, high-severity issues, report delivery failures, and ServiceTitan failures
- alert digests can be dispatched to a configured external webhook without adding a full incident platform

This improves the answer to: "What is stuck, who is impacted, and can we notify someone before customers notice?"

### Slice 5: Production Readiness CI

The fifth pass implemented release-discipline controls:

- added a `Production Readiness` GitHub Actions workflow
- provisions disposable Postgres 16 in CI
- verifies Prisma client generation
- verifies fresh migration deploy and seed through `pnpm prisma:verify:fresh`
- runs tests, typecheck, lint, and production build
- added a local `pnpm release:verify` command for pre-push release checks
- added a production release checklist document

This reduces the risk of direct production pushes by making migration/build/test failures visible before deployment.

## What Changed

### Per-Business Yelp Connection Health

The Autoresponder module now derives a separate Yelp connection posture for each business using:

- local lead count
- latest lead activity
- latest webhook proof
- latest successful Yelp lead sync/backfill
- latest failed Yelp lead sync/backfill
- pending Yelp intake/reconcile work
- global Yelp Leads credential/access state
- missing Yelp business ID state

This separates "Yelp is connected and receiving traffic" from "automation is configured and can send."

### Autoresponder Business Matrix

The Business delivery status table now reads more like an operator matrix:

- Business
- Yelp connection
- Automation
- Conversation
- Latest proof
- Notes

For each business, operators can now scan:

- whether Yelp intake has proof
- whether automation is off, ready, live, or blocked
- whether the business uses tenant defaults or a business override
- which channel is active
- whether follow-ups are enabled
- whether AI assist is on
- whether bounded conversation automation is active
- latest webhook, sync, and send proof

### Lead Detail Yelp Proof

Lead detail now includes a compact Yelp connection status in the lead summary.

It shows:

- connection status
- connection label
- latest webhook proof when available
- latest intake proof when webhook proof is not available

The attention panel also now flags failed, partial, or unresolved Yelp connection states.

### AI Conversation Decision Trace

Conversation automation turns now persist a clearer decision trace, including:

- customer inbound message excerpt
- source event key and external event ID
- classification intent and confidence
- selected template name, kind, render mode, and prompt source
- AI prompt preview when a template prompt is configured
- explicit routing note that conversation turns use intent/template-family routing rather than cadence rules
- content source, model, fallback reason, and warning codes
- operator review state
- automated turn count before/after/max

Lead detail now shows these facts in the conversation automation history so operators can answer:

- what customer message was processed
- whether the response came from AI, static template, or fallback
- which template/prompt guided the response
- why the turn was auto-sent, review-only, or handed off

### Review-Only Suggestion Workflow

When conversation automation creates a review-only suggested reply, the lead reply composer now shows the pending suggestion.

Operators can copy it into the Yelp-thread composer, edit it, and send it manually. The existing AI draft metadata path records whether the suggestion was edited before send.

### DB-Backed Lead Attention Filtering

The Leads queue now supports an explicit "Needs attention" filter that is pushed into the database query instead of being derived only from the currently visible page.

The DB-backed attention filter includes:

- failed or partial Yelp webhook processing
- failed or partial lead intake events
- missing CRM mappings
- unresolved, conflicting, or errored CRM mappings
- failed or partial CRM lead enrichment runs
- failed autoresponder attempts
- open operator issues linked to the lead

The top Attention count now uses the same DB predicate, so it represents the current filtered scope instead of only counting the rows visible on the page.

### Repeated Worker Failure Visibility

The existing operator issue queue now escalates repeated worker failures after three detections.

Covered issue types:

- lead sync failures
- CRM sync failures
- autoresponder send failures
- report delivery failures

When the same failure condition is detected repeatedly, the issue is promoted to critical severity and its details include:

- `deadLetter: true`
- `deadLetterReason: REPEATED_WORKER_FAILURE`
- current detected count
- escalation threshold

This is intentionally not a new queue platform. It is dead-letter-style visibility inside the current operator queue so repeated failures are easier to spot during pilot operations.

### Bounded Report Breakdown Aggregation

Report breakdowns no longer load every lead in the selected report window just to compute location and service rows.

The reporting detail path now uses DB-level grouped lead counts for:

- total leads
- mapped leads
- internal lifecycle status buckets
- location grouping, including business-location fallback
- service grouping

Yelp spend still comes from saved Yelp report payloads, but internal lead/outcome counts are now aggregated by the database before the page builds rows. This reduces the highest-risk full-window scan path without changing the reporting product surface.

### Customer-Visible Send Idempotency

The app now persists external side-effect idempotency records for current customer-visible send paths:

- Yelp thread lead replies
- Yelp masked-email lead replies
- automated initial/follow-up sends
- bounded conversation auto-replies
- scheduled report delivery emails

Successful duplicate sends are suppressed when the same idempotency key reappears. In-progress duplicates fail closed instead of sending again. Failed records can be reclaimed for a later retry.

This materially reduces duplicate-send risk under route retry, double-submit, or overlapping worker execution. It is still not a provider-native idempotency guarantee because Yelp, SMTP, and OpenAI do not all expose matching idempotency semantics.

### Durable Worker Job Foundation

Cron-driven workers now run through a DB-backed worker job layer with stable job keys, leases, attempt counters, bounded backoff, and dead-letter status.

Covered workers:

- internal reconcile program jobs
- internal reconcile lead webhooks
- internal reconcile scheduled reports
- internal reconcile pending reports
- internal reconcile report deliveries
- internal reconcile autoresponder follow-ups
- internal reconcile ServiceTitan lifecycle syncs
- dedicated autoresponder follow-up worker
- operational retention worker
- operational alert evaluation worker

If a worker is already claimed by an unexpired lease, overlapping cron calls skip that worker instead of running duplicate work.

If a worker repeatedly fails, the job moves to `DEAD_LETTERED` after its retry budget is exhausted and becomes visible in Audit.

This is still not a full queue platform. It materially improves the current cron/HTTP architecture by making worker ownership, failure, and dead-letter state durable and inspectable.

### Provider Request Budgets

External provider calls now pass through lightweight hourly tenant budgets where currently practical:

- Yelp lead/thread/report calls
- SMTP lead/report email sends
- OpenAI draft, summary, and autoresponder generation calls

When the budget is exceeded, the operation fails closed with an operational error instead of continuing retry pressure. This is a guardrail, not a full rate-limit platform.

### Operational Canary Route

Added a cron-protected canary route:

- `/api/internal/operations/canary`

It checks:

- database tenant lookup
- `CRON_SECRET`
- `APP_URL`
- safe webhook verification URL readiness
- reconcile, follow-up, and retention route locations

Optional `?http=1` performs the safe Yelp webhook verification echo against the configured app URL.

### Business Detail Operational Posture

Business detail now starts with a compact posture summary covering:

- Yelp connection proof
- business-specific autoresponder state
- conversation automation mode
- current programs
- ServiceTitan location mapping
- recurring report delivery
- open operator issues

The same surface shows warnings for incomplete control, including:

- leads exist but no business override is configured
- automation is enabled before Yelp proof is strong
- ServiceTitan mapping is incomplete for a business with leads
- local programs do not yet have confirmed Yelp IDs
- recent business sync did not complete cleanly
- open issues are linked to the business

### Program Detail Operational Posture

Program detail now starts with a compact posture summary covering:

- local program status
- budget state and scheduled budget changes
- active feature snapshot count
- latest Yelp job status
- associated business location and ServiceTitan mapping
- business-level automation posture

The page now warns when:

- the latest Yelp job failed or partially completed
- a non-draft program has no confirmed Yelp program ID
- ServiceTitan location mapping is missing
- the associated business has open operator issues

### Webhook And Reconcile Drilldown

Audit now includes an event-level webhook/reconcile table for work that needs attention.

The table shows:

- received time and age
- business identity
- linked lead
- event key and delivery ID
- webhook status
- linked sync run and sync status
- error summary or sync error count

The summary cards show queued events, processing events, oldest pending age, failed events in the last 24 hours, and completed/skipped totals.

### Operational Alert Evaluation

Added a cron-protected route:

- `/api/internal/operations/alerts`

It evaluates thresholds for:

- webhook oldest pending age
- failed/partial webhook reconciles in the last 24 hours
- autoresponder send failures in the last 24 hours
- open high-severity operator issues
- report delivery failures in the last 7 days
- ServiceTitan failures in the last 24 hours

`?dispatch=1` posts non-OK alert digests to `OPERATIONS_ALERT_WEBHOOK_URL` when configured. `OPERATIONS_ALERT_WEBHOOK_SECRET` is sent as a bearer token when set.

### Production Readiness Workflow

Added:

- `.github/workflows/production-readiness.yml`
- `pnpm release:verify`
- `docs/production-release-checklist.md`

The workflow runs on pull requests, pushes to `main`, and manual dispatch.

It verifies:

- frozen dependency install
- Prisma generate
- fresh migrations against disposable Postgres 16
- seed script against the disposable database
- full tests
- typecheck
- lint
- production build

## What Was Simplified

- Yelp health is no longer implied by successful sends only.
- Automation readiness no longer hides intake/reconcile health.
- Lead detail no longer requires opening technical payload sections just to know whether Yelp delivery proof exists.
- Lead attention filtering no longer depends on visible page rows only.
- Repeated worker failures no longer look identical to first-time failures in the operator queue.
- Report breakdowns no longer materialize every matching lead row in application memory.
- Customer-visible send paths now have a persisted replay guard.
- Business and program posture no longer requires scanning several disconnected sections.
- Webhook failures no longer require raw database inspection to identify event, business, lead, and sync context.

## What Remains From The Strategic Plan

Still not done:

- durable queue/dead-letter worker model
- full provider rate budgets by tenant/business with adaptive backoff
- external synthetic canaries and alert delivery
- deeper AI review operations, such as resolving a review item directly from the conversation queue
- full external monitoring/log sink such as Sentry, Axiom, Datadog, Logtail, or Prometheus-compatible metrics
- archive/export before retention redaction if long-term evidence must be preserved
- staging environment or Vercel preview smoke-test promotion workflow

## Manual QA Steps

1. Open `/autoresponder`.
2. Confirm Business delivery status has separate Yelp connection and Automation columns.
3. Confirm businesses with no traffic show a neutral "No traffic yet" or "Leads present" style state instead of pretending they are fully live.
4. Confirm businesses with webhook proof show "Webhook live."
5. Confirm businesses with completed backfill/sync but no webhook proof show "Sync verified."
6. Confirm businesses with missing Yelp business IDs show "Missing Yelp ID."
7. Confirm businesses with failed Yelp intake show a failed or partial connection state.
8. Confirm automation status still reflects rule/template/send readiness separately from Yelp connection.
9. Open a lead detail page with webhook proof.
10. Confirm the lead summary shows Yelp connection status and latest webhook proof.
11. Open a lead detail page that came from backfill only.
12. Confirm latest intake proof appears when webhook proof is absent.
13. Open a lead with failed/partial intake and confirm the attention panel includes the Yelp connection issue.
14. Replay or seed a review-only conversation turn with rendered body text.
15. Open that lead detail page and confirm the Conversation automation history shows customer excerpt, template, prompt source, content source, and operator review state.
16. Confirm the Reply composer shows the pending conversation suggestion.
17. Click "Use suggestion" and confirm the suggestion is copied into the Yelp-thread reply field.
18. Edit the reply, send it, and confirm the send audit records the AI draft metadata as edited.
19. Open `/leads`.
20. Set Attention to "Needs attention" and apply filters.
21. Confirm the filtered count, business split, and queue rows all reflect only attention-needed leads.
22. Combine "Needs attention" with a business filter and confirm counts stay scoped to that business.
23. Create or seed a worker failure issue with the same dedupe key detected three times.
24. Refresh the operator queue and confirm the issue becomes critical with repeated-worker-failure details.
25. Open a report detail page with a large lead window.
26. Confirm the breakdown rows still match location/service filters and the page does not load individual lead rows for aggregation.
27. Submit the same lead reply request twice with the same `Idempotency-Key` header.
28. Confirm the second request does not create a second Yelp thread or masked-email send.
29. Run the operational canary route with cron auth:

```bash
curl -sS -H "Authorization: Bearer $CRON_SECRET" \
  "https://YOUR_MAIN_APP/api/internal/operations/canary"
```

30. Optionally run safe HTTP verification:

```bash
curl -sS -H "Authorization: Bearer $CRON_SECRET" \
  "https://YOUR_MAIN_APP/api/internal/operations/canary?http=1"
```

31. Open a business detail page and confirm the Operational posture block shows Yelp connection, Autoresponder, Conversation mode, Programs, ServiceTitan mapping, Report delivery, and Open issues.
32. Confirm business warnings appear when a business has leads without an override, automation without Yelp proof, missing ServiceTitan mapping, unsettled programs, failed sync, or open issues.
33. Open a program detail page and confirm the Operational posture block shows local status, budget, active features, latest Yelp job, business/location, and business automation.
34. Confirm program warnings appear for failed jobs, missing Yelp program IDs, incomplete ServiceTitan mapping, and linked business issues.
35. Open `/audit` and confirm Webhook and reconcile drilldown shows stale, failed, or partial webhook events with event key, business, lead, status, sync run, and error summary.
36. Run the alert evaluator with cron auth:

```bash
curl -sS -H "Authorization: Bearer $CRON_SECRET" \
  "https://YOUR_MAIN_APP/api/internal/operations/alerts"
```

37. If `OPERATIONS_ALERT_WEBHOOK_URL` is configured, dispatch a non-OK digest:

```bash
curl -sS -H "Authorization: Bearer $CRON_SECRET" \
  "https://YOUR_MAIN_APP/api/internal/operations/alerts?dispatch=1"
```

38. Confirm the `Production Readiness` GitHub Actions workflow passes on the exact commit before production deploy.
39. For local release verification, run:

```bash
VERIFY_POSTGRES_URL=postgresql://postgres:postgres@localhost:5432/postgres?sslmode=disable \
VERIFY_RUN_SEED=1 \
pnpm release:verify
```

## Blunt Status

This slice improves production confidence and operator trust, but it is not the whole strategic enhancement plan.

The product is now clearer about a critical question:

"Is this business actually connected to Yelp, and is automation separately ready to act?"

The durable worker foundation is now implemented. The next best slices are production observability and scale validation:

- add full external monitoring/log sink
- validate query plans and worker behavior against production-like volume
- add staging or Vercel preview smoke-test promotion workflow
