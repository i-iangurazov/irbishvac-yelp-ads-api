# Production Scale Audit

## Executive Read

This repo is materially safer than it was before this pass, but it is not a magically elastic queue platform. The main gains in this hardening pass are:

- webhook reconcile and report-delivery workers now use explicit claim/lease behavior instead of optimistic overlap
- operator queue reads no longer force a full issue refresh on every page request
- reporting index is paginated and no longer loads full report payload history for the list view
- shared outbound retries now respect `Retry-After` and use jittered backoff
- key high-volume tables now have missing operational indexes

The biggest remaining scale risks are still:

- `/leads` with derived status filters
- report breakdown generation across wide date windows
- unbounded JSON/audit payload growth
- cron-and-HTTP worker throughput limits under sustained bursts
- connector and integrations surfaces that still load too much at once

## Top Likely Bottlenecks Under Larger Load

### 1. Leads status filtering still does an in-memory pass

`getLeadsIndex()` still fetches the base filtered lead set and then computes `processingStatus` in memory when `filters.status` is present. Under larger tenants, that means status-filtered queue views will cost more than plain paginated views and can degrade sharply with row growth.

Severity: High

### 2. Reporting breakdown still scales linearly with the selected window

`getReportBreakdownView()` still loads all leads in the chosen date window for the selected businesses, then aggregates in memory. That is fine for current pilot usage but becomes expensive for large date ranges or large lead volumes.

Severity: High

### 3. Raw JSON growth is still unchecked

The system stores a large amount of operational JSON:

- `SyncRun.requestJson` / `responseJson`
- `YelpWebhookEvent.payloadJson`
- `AuditEvent.*Json`
- connector sync payloads
- conversation turn metadata

Nothing in the current codebase archives or retires old rows. This is safe for auditability, but it means table size and I/O will keep climbing.

Severity: High

### 4. Worker throughput still depends on scheduled HTTP drains

The architecture is better protected now, but it is still cron-and-route driven rather than queue-daemon driven. If inbound volume outpaces scheduled drain capacity for long enough, backlog will still grow.

Severity: Medium-High

### 5. Integrations overview is still wide and largely unpaginated

The ServiceTitan integration surface still loads business, location, and service-category mapping tables in full. That is acceptable for small-to-moderate operator use, but it will become slow and noisy as catalog size grows.

Severity: Medium

## Heavy Routes And Pages

### `/leads`

Now paginated locally and much safer than before, but the derived status filter path is still expensive because it is not pushed down fully into the database.

### `/leads/[leadId]`

Heavy by design. It loads:

- Yelp events and timeline data
- webhook events and sync runs
- CRM mapping and lifecycle state
- automation attempts
- conversation turns
- linked issues
- AI assist state

This is acceptable per-lead, but it is not a cheap page.

### `/autoresponder`

Loads tenant settings, business overrides, templates, rules, delivery readiness, conversation metrics, and business status tables. It is operationally useful, but it is still one of the heavier admin surfaces.

### `/reporting`

The list view is now materially lighter because it uses summary queries plus pagination. The detail and breakdown surfaces remain heavy.

### `/reporting/[reportId]`

Still the heaviest reporting surface. Full result hydration plus breakdown aggregation is the main reporting cost center.

### `/integrations`

Backend-heavy because it hydrates connector configuration, inventory counts, catalog lookups, and multiple mapping tables together.

### `/audit`

Improved by queue pagination, but it still combines operator queue data with recent audit events and sync history in one request.

## Heavy Query Paths

### Leads index

`getLeadsIndex()` is now generally acceptable for paginated browsing, but status-filtered views still do more work than they should.

### Lead detail

`getLeadDetail()` is intentionally rich and still does a lot of work per request. The risk here is not classic N+1; it is per-page overfetch.

### Reporting breakdown

`getReportBreakdownView()` is still a full-window aggregation query path and remains the least scale-ready reporting flow.

### Connector overview

`getServiceTitanConnectorOverview()` still loads broad connector state and multiple reference lists together.

### Audit + issue queue

The queue is better now because it no longer forces a full refresh on every read, but it still aggregates several operator-oriented datasets together.

## N+1 And Repeated Lookup Findings

There is less true Prisma-style N+1 than the UI density suggests. The bigger problem is overfetch, not row-by-row lazy loading.

Current state:

- list views mostly use `include`/`select` properly
- issue summary counts are now direct count queries instead of summary-from-full-list
- reporting list view now uses a summary list query instead of full report hydration

Still worth watching:

- lead detail composes several separate reads after the primary lead fetch
- integrations overview composes multiple broad repository reads
- some summary surfaces still trade simplicity for extra hydration

## Pagination Gaps

Improved in this pass:

- operator queue now has real local pagination
- reporting request list now has real local pagination

Still weak:

- `/leads` with derived status filter is not truly database-first
- `/integrations` mapping tables are still effectively unbounded
- reporting breakdowns are aggregate views, not paginated slices
- per-lead conversation history is unpaginated, though bounded by thread size rather than tenant size

## Raw Payload, Audit, And Event Growth

This is one of the clearest future operational problems.

Current reality:

- payload-heavy tables are useful and justified
- nothing currently enforces retention windows, archive tiers, or compaction
- more scale will mean larger indexes, slower backups, and more expensive historical scans

What this pass did:

- added missing indexes on high-volume operational tables

What it did not do:

- add deletion or archival
- compress payload storage
- move operational history to colder storage

That omission is intentional. Silent deletion without a retention policy would be worse than carrying the growth risk openly.

## Background Jobs That May Overlap Or Race

### Yelp webhook reconcile

Improved. Sync runs are now claimed explicitly, stale `PROCESSING` runs can be recovered, and queue order favors newer work.

### Report schedule generation / delivery

Improved. Pending runs now use explicit claim behavior and stale-attempt recovery.

### Operator issue refresh

Improved. Queue reads now use a short-lived stale-refresh lease instead of refreshing on every request.

### Autoresponder follow-up worker

Reasonably safe already because attempt-level status and cadence dedupe provide protection, but still cron-driven.

### ServiceTitan lifecycle sync

Safer than before but still a weaker point. It does not yet have the same obvious distributed-claim rigor as webhook and report delivery work.

## Current Idempotency And Lease Behavior

Good:

- webhook events already dedupe by event key
- webhook sync runs now claim work explicitly and recover stale processing
- report schedule runs now claim work explicitly and recover stale attempts
- follow-up attempts have cadence-aware dedupe protection
- operator issue refresh has a lease window

Still limited:

- no dedicated job queue with visibility, priorities, or dead-letter behavior
- no cross-process global scheduler beyond cron-triggered HTTP routes

## Likely External Dependency Bottlenecks

### Yelp API

- lead backfill and webhook reconciliation can burst reads
- reporting requests and polls are slow batch flows by design
- rate-limit handling is better now because shared fetch retry honors `Retry-After`

### ServiceTitan API

- sync latency and auth failures can stall connector workflows
- broad mapping screens amplify pain when the connector is slow

### SMTP

- recurring delivery can back up on invalid recipients or provider-side throttling
- failure visibility exists, but throughput remains SMTP-provider-bound

### OpenAI

- AI reply drafts, summaries, and bounded AI autoresponder paths can add latency and cost
- the product already has functional fallbacks, but there is still no dedicated spend dashboard

## Current Observability Gaps

Improved in this pass:

- structured log timestamps
- reconcile and follow-up completion/failure summary logs
- queue-safe issue refresh behavior

Still missing:

- durable metrics backend
- per-tenant backlog charts
- explicit queue lag dashboards
- external dependency error-rate dashboards
- payload growth / retention monitoring

Today, operators can answer “what failed?” reasonably well. They still cannot answer “what is trending worse over the last day or week?” without database inspection.

## Production Risks Ranked By Severity

### High

- Derived lead status filtering is still in-memory for `/leads`
- Report breakdown generation still scales with the full selected lead window
- Payload and audit tables still have no retention or archival policy

### Medium-High

- Worker throughput still depends on cron-driven HTTP drains
- Sustained webhook bursts can still build backlog if drain cadence is insufficient

### Medium

- Integrations overview is still too wide for large connector catalogs
- ServiceTitan lifecycle sync still needs stronger concurrency hardening
- No durable metrics/telemetry backend exists yet

### Low-Medium

- Lead detail is intentionally heavy, but that cost is per-thread rather than tenant-wide
- AI features are bounded and guarded, but they still add latency/cost variability when enabled broadly

## Bottom Line

This codebase is safer and more scale-aware now. The most dangerous sources of duplicate background work and list-view overfetch have been reduced. The repo is materially stronger for moderate growth.

It is not yet a “throw arbitrarily high load at it” system. The main remaining pressure points are still:

- large-window aggregations
- unbounded historical JSON growth
- cron-driven backlog draining
- a few operator pages that still load too much at once
