# Report Recipient Routing Plan

## Current delivery model

Recurring report delivery already exists and is operational:

- schedules support weekly and monthly cadence
- account-level recipient emails are stored on the schedule
- account runs are generated from the current reporting pipeline
- location runs are already materialized when `deliverPerLocation` is enabled
- recent runs and failures already surface in reporting and the operator queue

This means the generation and send pipeline is already reusable.

## What is missing for per-location routing

Recipient routing is still flat.

Today:

- one recipient list lives on the schedule
- location fan-out reuses the same recipient list for every location run
- there is no explicit schedule-level delivery scope
- there is no per-location override model
- operators cannot see clearly who receives the account rollup versus location-specific runs

## What current models already support

The existing models already support:

- distinct account and location run records
- persisted run scope
- persisted recipient list per run
- separate generation and delivery statuses
- issue queue linkage for failed report delivery runs

That means the routing slice should extend the schedule model and run metadata, not replace the run model.

## Schema changes needed

Minimal justified changes:

- explicit schedule delivery scope
  - `ACCOUNT_ONLY`
  - `LOCATION_ONLY`
  - `ACCOUNT_AND_LOCATION`
- per-location recipient overrides on the schedule
- persisted recipient routing context on each run so past sends remain understandable even if the schedule changes later

No new portal or secondary delivery system is needed.

## Account-wide vs location-scoped behavior

The desired behavior is:

- `ACCOUNT_ONLY`
  - generate one account rollup run
  - deliver only the account rollup
- `LOCATION_ONLY`
  - generate the account run as the source aggregation step
  - materialize location runs
  - skip sending the account rollup
  - deliver only the location runs
- `ACCOUNT_AND_LOCATION`
  - generate the account rollup run
  - deliver the account rollup
  - also materialize and deliver location runs

## Recipient fallback rules

Use explicit routing:

- default account recipients are required
- a location override may replace recipients for a specific location
- if a location run has no override, it falls back to the default account recipients
- unknown/unmapped location buckets also fall back to the default account recipients

No hidden routing logic.

## UI changes needed

The reporting admin surface needs:

- delivery scope selector
- default account recipient field
- location recipient override editor
- preview of effective routing and fallback behavior
- clearer run list columns for scope and recipient routing

The existing reporting page and schedule form are the right surfaces. No new navigation is needed.

## Delivery foundation reuse

Reuse:

- current schedule and run persistence
- current enqueue/generation/poll/send workflow
- current CSV and dashboard-link delivery format
- current issue queue linkage for failed deliveries

The main implementation change is routing and run metadata shaping.

## Manual QA strategy

1. Create an `ACCOUNT_ONLY` schedule and confirm only the rollup run is delivered.
2. Create a `LOCATION_ONLY` schedule with one location override and confirm only location runs are delivered.
3. Confirm locations without overrides fall back to the default account recipients.
4. Create an `ACCOUNT_AND_LOCATION` schedule and confirm both the rollup and location runs are sent.
5. Verify recent runs show clear scope and routing context.
6. Force a delivery failure and confirm the run and linked issue retain scope and recipient context.
7. Edit the schedule after runs exist and confirm previous runs still reflect their original routing context.
