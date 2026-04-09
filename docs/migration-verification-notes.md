# Migration Verification Notes

## What was verified in this environment

- Local PostgreSQL is reachable through the repo's Docker Compose service:
  - `docker compose ps`
  - `docker exec irbishvac-yelp-ads-api-postgres-1 psql -U postgres -d yelp_ads_console_verify -c "SELECT 1 AS ok;"`
- Prisma client generation works locally:
  - `pnpm prisma:generate`
- A fresh throwaway database can be created successfully:
  - `yelp_ads_console_verify`

## What could not be fully verified here

- `prisma migrate deploy` does **not** currently complete successfully against a fresh local database in this environment.
- The failure remains a generic Prisma schema-engine error even when run through the local Prisma binary:

```text
Environment variables loaded from .env
Prisma schema loaded from prisma/schema.prisma
Datasource "db": PostgreSQL database "yelp_ads_console_verify", schema "public" at "localhost:5432"

Error: Error: Schema engine error:
```

- Re-running with `DEBUG='*'` provided Prisma CLI trace output, but still did not expose a more specific migration SQL failure.

## Likely failure boundary

The current evidence suggests the launch-readiness gap is **not basic database connectivity**:

- Postgres is running.
- A throwaway database can be created.
- `SELECT 1` succeeds against the verification database.

The unresolved gap is specifically around **Prisma's schema-engine execution path** in this local environment.

That means there are still two distinct questions:

1. Is the Prisma CLI/schema engine healthy in this environment?
2. Is the raw SQL migration chain itself valid on a clean database?

This pass improved confidence on question 1 by proving the current failure mode is real and reproducible. It does **not** claim the Prisma CLI migration path is fixed.

## New reproducible verification path

This repo now includes:

- [verify-fresh-migrations.mjs](/Users/ilias_iangurazov/Commercial/irbishvac-yelp-ads-api/scripts/verify-fresh-migrations.mjs)
- `pnpm prisma:verify:fresh`

Recommended usage on a production-like Postgres environment:

```bash
VERIFY_POSTGRES_URL=postgresql://postgres:postgres@localhost:5432/postgres?sslmode=disable pnpm prisma:verify:fresh
```

What the script does:

1. Creates a throwaway verification database.
2. Runs the local Prisma binary with `migrate deploy`.
3. If Prisma still fails, replays each `prisma/migrations/*/migration.sql` file with `psql`.
4. Optionally runs seed if `VERIFY_RUN_SEED=1`.
5. Drops the throwaway database unless `VERIFY_KEEP_DB=1`.

Useful env vars:

- `VERIFY_POSTGRES_URL`
- `VERIFY_DATABASE_NAME`
- `VERIFY_KEEP_DB=1`
- `VERIFY_RUN_SEED=1`
- `VERIFY_PSQL_BIN=/path/to/psql`

## What environment is needed for full confidence

To close the remaining migration gap before rollout:

- Run the new verifier on a clean Postgres environment outside the current sandbox restrictions.
- Confirm both:
  - `prisma migrate deploy` passes
  - optional seed passes if your deployment process depends on it
- Capture the exact Prisma version and Postgres version used for the successful verification run.

## Current honest conclusion

- Migration confidence is better than before because there is now:
  - a reproducible fresh-db verification path
  - explicit separation between Prisma CLI failure and raw SQL validation
  - clear notes on what was and was not proven
- Migration confidence is **not yet complete** because this environment still cannot show a fully successful fresh-db `prisma migrate deploy` run.
