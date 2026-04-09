# Report Delivery Summary

## What Was Implemented

Recurring report delivery was already live in the repo. This pass aligned it with the richer grouped reporting output instead of rebuilding the scheduling system.

Implemented in this pass:

- delivery summaries now carry the fuller grouped metric set in [features/report-delivery/service.ts](/Users/ilias_iangurazov/Commercial/irbishvac-yelp-ads-api/features/report-delivery/service.ts) and [features/report-delivery/email.ts](/Users/ilias_iangurazov/Commercial/irbishvac-yelp-ads-api/features/report-delivery/email.ts)
  - mapped leads
  - active
  - contacted
  - booked
  - scheduled
  - job in progress
  - completed
  - won
  - lost
  - mapping / booked / scheduled / completion / win rates
  - CPL
  - cost per booked lead
  - cost per completed job
- delivery CSV rows now preserve source clarity with scoped column names
- grouped location and service breakdown rows included in delivery summaries now carry the richer partner lifecycle fields too

## What Is Now Truly Live

These capabilities are live and persisted:

- weekly schedules
- monthly schedules
- timezone-aware send timing
- recipient list management
- enabled / disabled schedules
- recent run history
- sent / failed / pending visibility
- manual generate now
- manual resend for ready runs
- account delivery with optional per-location fan-out
- email summary plus CSV attachment when SMTP is configured

## What Remains Intentionally Out Of Scope

- PDF delivery
- client self-serve delivery management
- tenant-specific SMTP credentials in the UI
- separate recipient routing by location or service
- a campaign-style automation builder

## Assumptions and Limitations

1. The scheduling model remains account-level.
   - `deliverPerLocation` fans out delivery runs from the same account report window.

2. Delivery still depends on the same honest reporting boundaries:
   - Yelp-native delayed batch metrics
   - partner lifecycle metrics from internal systems
   - derived conversion metrics

3. If SMTP is missing, generation can still succeed.
   - delivery fails explicitly and remains visible in run history.

4. Service-level spend remains conservative in delivery output too.
   - if the saved Yelp payload cannot be mapped safely, service spend remains in `Unknown service`.

## Exact Manual QA Steps

1. Open `/reporting`.
2. Create or edit a weekly or monthly schedule.
3. Confirm the schedule appears in the recurring delivery list with readable cadence, recipient count, and enabled state.
4. Click `Generate now`.
5. Confirm a run appears in recent delivery runs.
6. Wait for the underlying Yelp batch to reach `READY`.
7. Confirm the run summary now includes the richer grouped metrics.
8. If SMTP is configured:
   - confirm the run reaches `SENT`
   - confirm the email shows:
     - spend
     - lead intake
     - mapped / active / contacted / booked / scheduled / in progress / completed / won / lost
     - conversion rates
     - source boundary language
     - dashboard link
     - CSV attachment
9. If `Per-location delivery` is enabled:
   - confirm location runs are created
   - confirm unknown location remains visible when relevant
10. Use `Resend` on a ready run and confirm delivery state updates again.

## Verification

Validated with:

- `pnpm test tests/unit/reporting-breakdowns.test.ts tests/unit/report-delivery.test.ts tests/integration/report-export-route.test.ts`
- `pnpm typecheck`
