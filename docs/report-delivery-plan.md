# Report Delivery Plan

## Current Foundation

Recurring delivery is already live in the repo.

Current components:

- `ReportSchedule` for persisted schedule configuration
- `ReportScheduleRun` for persisted generation and delivery history
- schedule calculation helpers for weekly and monthly windows
- internal reconcile processing for:
  - due schedules
  - pending generation
  - pending delivery
- SMTP email delivery with dashboard link and CSV attachment
- admin UI on `/reporting` for:
  - listing schedules
  - editing schedules
  - viewing recent runs
  - generating now
  - resending ready runs

## What Is Already Trustworthy

The following behavior is already real:

- weekly and monthly cadence
- timezone-aware send timing
- recipient lists
- enabled / disabled schedules
- account-level runs with optional per-location fan-out
- persisted generation state and delivery state
- recent run visibility
- resend / regenerate actions
- audit logging for schedule create, generate, and deliver actions

## Gaps Remaining

The remaining work is not structural. It is about making delivery output match the richer reporting model.

Gaps:

- delivery summaries still use a reduced metric set
- CSV attachment rows need stronger source-scoped metric naming
- delivery summaries should carry the richer grouped partner lifecycle metrics now available:
  - active
  - contacted
  - won
  - lost
  - mapping rate
  - booked rate
  - scheduled rate
  - completion rate
  - win rate

## Generation Flow To Preserve

This pass should keep the current operator-grade generation path:

1. due schedule is detected
2. account-level report request is enqueued against the saved Yelp reporting pipeline
3. saved report is polled until ready
4. grouped breakdowns are computed from:
   - saved Yelp batch data
   - partner lifecycle lead data
5. one account run or multiple location runs are hydrated
6. ready runs send email plus CSV attachment

## Delivery Output Requirements

Generated content must continue to label:

- Yelp-native delayed batch metrics
- partner lifecycle metrics
- derived conversion metrics

Generated content should include where supported:

- spend
- lead intake
- mapped leads
- active
- contacted
- booked
- scheduled
- job in progress
- completed
- won
- lost
- mapping rate
- booked rate
- scheduled rate
- completion rate
- win rate
- CPL
- cost per booked lead
- cost per completed job
- location breakdown
- service breakdown
- unknown / unmapped buckets

## Admin UX To Preserve

No new portal or campaign builder is needed.

Keep:

- concise schedule list
- focused schedule form
- recent run history
- visible sent / failed / pending states
- manual generate / resend actions

## Manual QA Strategy

1. Open `/reporting` and confirm schedules and recent runs still render.
2. Create or edit a weekly schedule.
3. Generate a run manually.
4. Verify the run moves through generation states correctly.
5. If SMTP is configured, verify the delivered email and CSV attachment include the richer grouped metrics.
6. Verify location fan-out still works when `Per-location delivery` is enabled.
7. Verify failures remain visible when SMTP or recipient setup is invalid.
