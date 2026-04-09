# Launch Readiness Hardening Summary

## What was improved

### 1. Follow-up execution is no longer only a side effect of shared reconcile

- Added a dedicated worker endpoint at [route.ts](/Users/ilias_iangurazov/Commercial/irbishvac-yelp-ads-api/app/api/internal/autoresponder/followups/route.ts).
- Added explicit worker entrypoint `runLeadAutomationFollowUpWorker()` in [service.ts](/Users/ilias_iangurazov/Commercial/irbishvac-yelp-ads-api/features/autoresponder/service.ts).
- Updated the GitHub Actions scheduler in [reconcile.yml](/Users/ilias_iangurazov/Commercial/irbishvac-yelp-ads-api/.github/workflows/reconcile.yml) so the dedicated follow-up route is called directly alongside the shared reconcile route.
- Added claim/lease behavior for due attempts in [autoresponder-repository.ts](/Users/ilias_iangurazov/Commercial/irbishvac-yelp-ads-api/lib/db/autoresponder-repository.ts) to reduce duplicate worker pickup.

### 2. Outside-working-hours follow-ups now re-queue safely

- Added next-valid-window calculation in [logic.ts](/Users/ilias_iangurazov/Commercial/irbishvac-yelp-ads-api/features/autoresponder/logic.ts).
- When a due follow-up lands outside working hours, the attempt is now re-queued to the next valid send window instead of being permanently skipped.
- Re-queues are audited and logged like other autoresponder actions.

### 3. Leads queue now has real local pagination

- Added `page` and `pageSize` filters in [schemas.ts](/Users/ilias_iangurazov/Commercial/irbishvac-yelp-ads-api/features/leads/schemas.ts).
- Added query-level pagination support in [leads-repository.ts](/Users/ilias_iangurazov/Commercial/irbishvac-yelp-ads-api/lib/db/leads-repository.ts).
- Updated [service.ts](/Users/ilias_iangurazov/Commercial/irbishvac-yelp-ads-api/features/leads/service.ts) to return:
  - total synced leads
  - filtered leads
  - visible rows
  - current page
  - total pages
  - page row range
- Updated [page.tsx](/Users/ilias_iangurazov/Commercial/irbishvac-yelp-ads-api/app/(console)/leads/page.tsx) and [leads-filter-form.tsx](/Users/ilias_iangurazov/Commercial/irbishvac-yelp-ads-api/components/forms/leads-filter-form.tsx) with page navigation and page-size control.

### 4. Historical Yelp backfill now supports multi-page runs

- The manual backfill workflow in [service.ts](/Users/ilias_iangurazov/Commercial/irbishvac-yelp-ads-api/features/leads/service.ts) now fetches multiple Yelp `lead_ids` pages per run instead of stopping after the first page.
- Current run limits stay explicit:
  - `YELP_LEAD_IMPORT_PAGE_SIZE = 20`
  - `YELP_LEAD_IMPORT_MAX_PAGES_PER_RUN = 5`
- Latest import UI now explains:
  - how many Yelp pages were fetched
  - how many lead IDs were returned
  - whether deeper Yelp history still remains

### 5. Migration verification is more reproducible and honest

- Added [migration-verification-notes.md](/Users/ilias_iangurazov/Commercial/irbishvac-yelp-ads-api/docs/migration-verification-notes.md).
- Added a fresh-db verifier at [verify-fresh-migrations.mjs](/Users/ilias_iangurazov/Commercial/irbishvac-yelp-ads-api/scripts/verify-fresh-migrations.mjs).
- Added `pnpm prisma:verify:fresh` in [package.json](/Users/ilias_iangurazov/Commercial/irbishvac-yelp-ads-api/package.json).
- Updated [README.md](/Users/ilias_iangurazov/Commercial/irbishvac-yelp-ads-api/README.md) with the fresh-migration verification path.

## What launch risks were reduced

- Follow-up sends are less fragile because they now have a dedicated execution path and lease-style claiming.
- Outside-hours follow-ups are less likely to quietly disappear because they re-queue instead of terminating as skips.
- Leads operators can now page through the queue instead of loading one long list.
- Historical recovery is stronger because a manual import can move beyond a single Yelp page in one run.
- Migration readiness is more transparent because there is now a repeatable fresh-db verification command instead of an undocumented local failure.

## What remains unresolved

- Fresh-db `prisma migrate deploy` is still **not** proven successful in this local environment. The current fresh-db attempt still fails with a generic Prisma schema-engine error. See [migration-verification-notes.md](/Users/ilias_iangurazov/Commercial/irbishvac-yelp-ads-api/docs/migration-verification-notes.md).
- The dedicated follow-up worker is scheduled and live, but still shares the same high-level cron/security model as the rest of the internal workers. This is a hardening improvement, not a full queue-system rewrite.
- Historical backfill is multi-page now, but still intentionally bounded per run to avoid turning support tooling into an unbounded long-running import.

## Is the system now closer to 90%+ readiness?

Yes, materially closer.

Practical judgment after this pass:

- Leads: around **89%** readiness
- Autoresponder: around **84%** readiness
- Combined slice: around **87%** readiness

It is now much closer to a `90%+` launch bar, but I would still keep one explicit yellow-zone blocker open:

- prove `prisma migrate deploy` on a clean production-like Postgres environment outside this local schema-engine failure mode

## Exact manual QA steps

1. Open `/leads`.
2. Confirm the queue header shows:
   - total synced leads
   - filtered leads
   - current page range
   - current page number
3. Change `Page size` in the filters and confirm the queue updates to the new page-size setting.
4. Move to page 2 and confirm:
   - the row range updates
   - previous/next navigation works
   - filters remain applied
5. Run a manual historical import for a business with more than one Yelp page available.
6. Confirm the latest import card shows:
   - pages fetched
   - returned lead IDs
   - whether more Yelp history remains
7. Open `/autoresponder`.
8. Confirm business overrides still load correctly and that follow-up cadence settings remain business-scoped.
9. Trigger the dedicated follow-up worker endpoint with cron auth:
   - `GET /api/internal/autoresponder/followups`
10. Verify a due follow-up:
    - sends in-thread when eligible
    - re-queues to the next working window when due outside hours
11. Open the linked lead detail and confirm follow-up history stays visible there.
12. Open `/audit` and confirm failed follow-ups still surface through the existing queue.
13. Run `pnpm prisma:verify:fresh` on a clean Postgres environment and capture:
    - whether Prisma migrate deploy passed
    - whether raw SQL fallback passed if Prisma failed
