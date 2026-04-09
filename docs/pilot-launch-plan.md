# Pilot Launch Plan

## Pilot scope

Run this as a **controlled production pilot**, not a broad launch.

Recommended pilot scope:

- **1 to 3 Yelp businesses**
- one internal operator owner per business
- one technical owner on call for rollout week
- webhook-first live intake enabled
- Yelp-thread autoresponder enabled only for businesses that have been reviewed in the Autoresponder module
- ServiceTitan connector enabled only where business/location mappings are already reviewed

Keep the pilot focused on the current intended loop:

1. Yelp lead intake
2. operator queue review
3. Yelp-thread reply / follow-up behavior
4. partner lifecycle sync
5. grouped reporting
6. recurring report delivery

## Suggested business mix

Use a small mix that exposes real-world variance without overwhelming the team:

- 1 lower-volume business for safe operational burn-in
- 1 normal-volume business with active operators
- optional 1 business using the ServiceTitan connector and recurring reports

Do not start with:

- every business
- every location
- every recipient routing branch
- fully unattended autoresponder across all tenants

## Operator oversight expectations

During pilot week, assume active daily oversight.

Minimum coverage:

- one operator checks `/leads`, `/audit`, `/autoresponder`, and `/reporting` at least twice daily
- one technical owner checks cron execution, migration status, and connector health daily
- failed autoresponder or report delivery issues are reviewed the same business day
- no business runs fully unattended until at least several days of stable behavior

## Success criteria

The pilot is successful if all of these remain true for the selected businesses:

- Yelp webhook intake is consistently landing in the console
- leads are visible and usable in `/leads`
- the queue counts and pagination remain understandable to operators
- initial autoresponder sends remain Yelp-thread-first and properly disclosed
- 24-hour and following-week follow-ups run without duplicate sends
- business-scoped overrides behave as expected
- downstream lifecycle updates continue to appear on lead detail and in reporting
- recurring reports reach the intended recipients with correct scope
- the issue queue surfaces failures instead of hiding them
- operators can clear or retry issues without engineering intervention for routine cases

Practical pilot success target:

- no unresolved red-severity issue older than 1 business day
- no duplicate automated Yelp-thread sends
- no silent webhook outage longer than the monitoring threshold
- no report schedule repeatedly failing without operator visibility

## Rollback criteria

Rollback does **not** mean deleting the product. It means narrowing scope fast.

Rollback triggers:

- webhook intake outage exceeds the red threshold and cannot be restored quickly
- duplicate automated follow-ups are observed
- autoresponder sends incorrect or misleading messages in production
- recurring reports are reaching the wrong recipients or wrong location scope
- migration/deployment path is still not proven when a production schema change is required

Rollback actions:

1. Disable autoresponder at tenant default level.
2. Disable business-specific autoresponder overrides for affected businesses.
3. Pause recurring report schedules for affected scopes.
4. Continue webhook intake and operator review manually.
5. Keep `/audit` as the single queue for unresolved failures while rollout scope is reduced.

## Daily checks during pilot

### Every business day morning

- confirm GitHub reconcile workflow ran on schedule
- confirm `/api/internal/reconcile` and `/api/internal/autoresponder/followups` are reachable
- open `/audit` and review:
  - open failed reconcile issues
  - autoresponder failures
  - report delivery failures
  - stale downstream sync issues
- open `/leads` and confirm:
  - new leads are appearing
  - queue counts and page navigation look sane
  - no sudden spike in unmapped or failed rows

### Midday

- check at least one recent lead detail per pilot business
- confirm Yelp-thread reply history and automation history still look correct
- confirm no follow-up was sent after customer reply or human takeover

### End of day

- review `/reporting` recent runs
- confirm no failed location-scoped sends remain unreviewed
- confirm ServiceTitan connector health if enabled for that business
- confirm operator queue has no unattended red items

## Suggested pilot timeline

### Days 1 to 2

- webhook intake live
- initial autoresponder only
- operators review all new leads manually

### Days 3 to 5

- enable 24-hour follow-up for reviewed businesses
- keep 7-day follow-up enabled only if the first businesses stay stable

### Week 2

- add recurring report delivery
- optionally add a second or third business
- keep rollout paused if migration confidence or operational thresholds are still red

## Current blunt judgment

The system is ready for a **controlled pilot**, not a broad unattended rollout.

The main remaining yellow/red item is still schema migration confidence on a fresh production-like database. See [production-migration-checklist.md](/Users/ilias_iangurazov/Commercial/irbishvac-yelp-ads-api/docs/production-migration-checklist.md).
