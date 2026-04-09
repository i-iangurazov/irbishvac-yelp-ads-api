# Launch Readiness Hardening Plan

## Current weakness: follow-up execution

- Due follow-ups are currently processed from the shared internal reconcile route.
- That means 24-hour and following-week follow-ups depend on the same periodic entrypoint that also handles:
  - Yelp webhook reconcile
  - report scheduling and delivery
  - ServiceTitan lifecycle sync
  - program job reconcile
- The current flow is operational, but it is not durable enough for launch confidence because:
  - follow-up execution cadence is coupled to the shared cron path
  - outside-working-hours due follow-ups are skipped instead of re-queued to the next valid send window
  - there is no narrower worker surface dedicated to autoresponder follow-up processing

## Current Leads queue pagination limitation

- The Leads queue is not locally paginated.
- The UI now explains this honestly, but the runtime still loads all matching rows at once and reports `visibleRows = filteredLeads`.
- That is acceptable for small tenants, but it becomes a launch risk once the local synced lead count grows enough to degrade page load and scanability.

## Current historical backfill limitation

- Manual Yelp historical import still requests only one Yelp page per run.
- The hardcoded request size remains `YELP_LEAD_IMPORT_PAGE_SIZE = 20`.
- Operators now understand that the old “20 leads” confusion came from this import limit, but the capability gap still remains:
  - a manual recovery/backfill run cannot continue across multiple Yelp pages automatically
  - operators have no structured sense of page progress beyond `hasMore`

## Current migration verification gap

- The repository has an orderly Prisma migration chain and a documented local Postgres compose setup.
- But the latest migration path has not been fully re-proven on a clean production-like database in this environment after the newest schema additions.
- The known problem is not schema design ambiguity; it is confidence in reproducible migration verification on a fresh database.

## Dependency order

1. Follow-up execution hardening
   - highest operational risk because it affects live customer-thread automation timing
2. Leads pagination
   - directly affects operator throughput and queue trust as data volume grows
3. Multi-page historical backfill
   - improves recovery and onboarding confidence without changing the webhook-first live path
4. Migration verification
   - improves rollout confidence and deployment readiness around all of the above

## Rollout risk if each issue remains unfixed

### If follow-up execution remains as-is

- missed or delayed follow-ups if the shared reconcile job falls behind
- safe but weak handling for after-hours due attempts
- reduced confidence in “set it live” automation behavior

### If Leads queue pagination remains absent

- slower list rendering as synced lead volume grows
- harder operator scanning on large tenants
- increased pressure to use filters just to keep the page usable

### If historical backfill remains one-page-only

- weaker recovery after onboarding a business with deeper lead history
- more manual rerun behavior
- continued operator confusion around whether history is fully loaded

### If migration verification remains informal

- higher deployment anxiety
- harder release signoff for schema-heavy changes
- risk of discovering environment-specific migration issues too late

## Hardening direction

### Follow-up execution

- add a dedicated due-follow-up worker path
- keep the shared reconcile route as a caller, not the only operational entrypoint
- add attempt claiming/locking behavior so due follow-ups are not double-processed
- re-queue outside-working-hours follow-ups to the next valid working window instead of only skipping them

### Leads pagination

- add explicit page and page-size filters
- paginate in the query layer, not just in the UI
- keep count semantics separate:
  - total synced leads
  - filtered leads
  - visible rows on this page

### Historical backfill

- keep webhook-first intake as the live path
- extend manual historical import to fetch multiple Yelp pages safely
- keep idempotent snapshot sync per lead
- persist page progress in the existing sync-run stats

### Migration verification

- document a clean verification path against a fresh Postgres 16 database
- add a reproducible helper script for:
  - `prisma generate`
  - `prisma migrate deploy`
  - `prisma seed`
- state clearly what still depends on environment-specific Postgres access

## Manual QA strategy

1. Start a clean Postgres 16 instance.
2. Apply migrations and seed the database using the documented verification path.
3. Ingest a new Yelp lead and verify the initial autoresponder still runs immediately.
4. Configure a business-specific follow-up rule with working hours.
5. Move a due follow-up outside working hours and confirm it is re-queued instead of skipped.
6. Run the dedicated follow-up worker and confirm only due, eligible attempts send.
7. Open `/leads` and verify:
   - total synced leads
   - filtered count
   - current page count
   - page number
   - page size
8. Change page size and page number and confirm the list and summary stay truthful.
9. Run a historical backfill for a business with more than one Yelp page of lead IDs and confirm the sync run records:
   - pages fetched
   - returned lead IDs
   - imported and updated counts
   - whether more Yelp pages remained
10. Confirm lead detail and issue queue behavior remain unchanged except for stronger follow-up execution and clearer queue shaping.
