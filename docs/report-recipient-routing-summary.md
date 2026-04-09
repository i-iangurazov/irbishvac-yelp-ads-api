# Report Recipient Routing Summary

## What routing behavior is now live

Recurring report delivery now supports explicit delivery scope and recipient routing:

- `Account rollup only`
- `Per location only`
- `Account and per location`

Schedules now keep:

- default account recipients
- optional per-location recipient overrides

Delivery routing works like this:

- account rollup runs use the default account recipients
- location runs use a location override when one exists
- location runs fall back to the default account recipients when no override exists
- unknown-location buckets also fall back to the default account recipients

Each persisted run now stores its routed recipients and routing context so historical runs remain understandable even after a schedule is edited later.

## What admins/operators can configure

On the Reporting page, admins and operators can now:

- choose delivery scope when creating or editing a schedule
- set default account recipients
- add location-specific recipient overrides
- preview the routing behavior in concise operator language
- review recent runs with clearer scope and routing labels

## Fallback behavior

Fallback is explicit:

- location override present: use the override
- no location override: use default account recipients
- unknown location bucket: use default account recipients
- `Per location only` schedules skip the account rollup email

## What remains intentionally out of scope

- service-specific recipient routing
- client self-serve delivery management
- PDF-first delivery
- custom recipient groups beyond account default plus location override
- delivery branching based on AI or business logic outside explicit schedule config

## Exact manual QA steps

1. Open `/reporting`.
2. Create an `Account rollup only` schedule with default recipients and confirm the schedule list shows the correct delivery mode.
3. Generate the schedule manually and confirm the recent run is account-scoped and uses the default recipient routing label.
4. Edit the schedule to `Per location only`.
5. Add one location-specific recipient override and save.
6. Generate the schedule again and confirm the account run is skipped while location runs are created.
7. Confirm the overridden location run shows the location override routing label.
8. Confirm a different location run without an override falls back to the default account recipients.
9. Edit the schedule to `Account and per location` and generate again.
10. Confirm both the account rollup run and the location runs are delivered and that recent runs show clear scope and routing context.
11. Force a delivery failure and confirm the run error plus linked issue retain the relevant scope and recipient-routing context.

## Assumptions and limitations

- default account recipients remain required so location fallback always has a safe destination
- location routing is based on the report’s location breakdown rows, including the unknown bucket
- old schedules are migrated so legacy `deliverPerLocation=true` behavior maps to `Per location only`
- service-filtered routing is still out of scope even though grouped service reporting exists
