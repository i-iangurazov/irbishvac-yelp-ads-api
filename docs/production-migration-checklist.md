# Production Migration Checklist

## Current status

Migration confidence improved, but it is still **not fully proven** in this local environment.

What is true today:

- Prisma client generation works
- local Postgres connectivity works
- a fresh verification database can be created
- `pnpm prisma:verify:fresh` now exists
- GitHub Actions now runs disposable Postgres migration verification through `.github/workflows/production-readiness.yml`

What is still unproven here:

- a fully successful fresh-db `prisma migrate deploy` run through Prisma CLI
- the new CI workflow result until it has completed on GitHub for the exact commit being deployed

See [migration-verification-notes.md](/Users/ilias_iangurazov/Commercial/irbishvac-yelp-ads-api/docs/migration-verification-notes.md).

## Goal of this checklist

Before production pilot launch or before any production schema change:

1. prove the migration chain on a clean production-like Postgres database
2. prove whether Prisma CLI itself is healthy in that environment
3. document the exact versions and result

## Required environment

Use a clean Postgres 16 environment that is close to production:

- empty database server or clean throwaway database
- network path allowed for the verification runner
- local `psql` available
- local repo dependencies installed

Recommended minimum metadata to capture:

- Postgres version
- Node version
- Prisma version
- OS / container runtime if relevant

## Exact verification steps

### 1. Install dependencies

```bash
pnpm install
pnpm prisma:generate
```

### 2. Run fresh-db verification

```bash
VERIFY_POSTGRES_URL=postgresql://postgres:postgres@localhost:5432/postgres?sslmode=disable pnpm prisma:verify:fresh
```

Or run the full local release gate:

```bash
VERIFY_POSTGRES_URL=postgresql://postgres:postgres@localhost:5432/postgres?sslmode=disable \
VERIFY_RUN_SEED=1 \
pnpm release:verify
```

Recommended optional variants:

```bash
VERIFY_POSTGRES_URL=postgresql://postgres:postgres@localhost:5432/postgres?sslmode=disable VERIFY_RUN_SEED=1 pnpm prisma:verify:fresh
```

```bash
VERIFY_POSTGRES_URL=postgresql://postgres:postgres@localhost:5432/postgres?sslmode=disable VERIFY_KEEP_DB=1 pnpm prisma:verify:fresh
```

### 3. Record the result

Capture:

- whether `prisma migrate deploy` passed
- whether raw SQL fallback passed if Prisma failed
- whether seed passed if run
- the exact database name used

## How to interpret the result

### Green

- `prisma migrate deploy` passes
- optional seed passes if used

This is the real production-like success criterion.

### Yellow

- `prisma migrate deploy` fails
- raw SQL migration files all pass

This means the migration chain may be valid, but Prisma CLI/schema-engine health is still suspect in that environment. Do not call migration risk solved yet.

### Red

- raw SQL replay fails on the clean database

This means the migration chain itself still has an unresolved problem. Do not launch a production schema change until fixed.

## Production deployment checklist

Before deployment:

- confirm the target production database has a recent backup or snapshot
- confirm no manual schema drift exists outside Prisma migrations
- confirm the exact migration chain in `prisma/migrations/`
- confirm `pnpm prisma:verify:fresh` has been run successfully in a production-like environment
- confirm the `Production Readiness` GitHub Actions workflow passed for the exact commit

During deployment:

- run `pnpm prisma:migrate:deploy`
- do not serve traffic until the migration step succeeds
- run `pnpm build` against the same commit being deployed

After deployment:

- log in to the app
- confirm `/leads`, `/autoresponder`, `/audit`, and `/reporting` load successfully
- confirm recent cron routes still run
- confirm no immediate issue-queue spike appears after deployment

## Current honest gap

At the time of writing:

- fresh-db verification is **better instrumented**
- but Prisma CLI migration success is still **not** proven in this local environment

So the production migration bar is:

- do one clean successful `pnpm prisma:verify:fresh` run outside this local schema-engine failure mode
- then treat migration confidence as materially improved

Until that happens, migration readiness stays yellow.

## CI gate

The production readiness workflow verifies:

- Postgres 16 disposable database
- `pnpm install --frozen-lockfile`
- `pnpm prisma:generate`
- `pnpm prisma:verify:fresh` with `VERIFY_RUN_SEED=1`
- `pnpm test`
- `pnpm typecheck`
- `pnpm lint`
- `pnpm build`

Treat this workflow as required for production schema changes.
