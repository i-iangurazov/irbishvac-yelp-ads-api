# Production Release Checklist

## Purpose

Use this checklist before pushing or deploying a production change.

The goal is to catch broken migrations, type errors, test regressions, lint failures, and build failures before they reach the live Vercel app.

## Required CI Gate

GitHub Actions now includes:

- `.github/workflows/production-readiness.yml`

It runs on:

- pull requests
- pushes to `main`
- manual workflow dispatch

The workflow provisions disposable Postgres 16 and verifies:

- dependency install with a frozen lockfile
- Prisma client generation
- fresh migration deploy through `pnpm prisma:verify:fresh`
- seed script against the disposable database
- full Vitest suite
- TypeScript typecheck
- lint
- production build

## Local Pre-Push Gate

Run this before direct production pushes:

```bash
VERIFY_POSTGRES_URL=postgresql://postgres:postgres@localhost:5432/postgres?sslmode=disable \
VERIFY_RUN_SEED=1 \
pnpm release:verify
```

Requirements:

- local Postgres is running
- `psql` is available on PATH or `VERIFY_PSQL_BIN` is set
- dependencies are installed

If local Postgres is not available, the minimum non-migration gate is:

```bash
pnpm prisma:generate
pnpm test
pnpm typecheck
pnpm lint
pnpm build
```

That is not enough for schema changes.

## Production Deployment Checks

Before deployment:

- confirm CI passed for the exact commit being deployed
- review `git diff --stat` and verify no unrelated files are included
- verify `.env.example` matches any new required env vars
- verify production secrets are configured in Vercel and GitHub Actions
- verify the production database has a recent backup or snapshot
- verify the latest migration was included intentionally

During deployment:

- run `pnpm prisma:migrate:deploy` against the production database
- stop if migration deploy fails
- deploy only the same commit that passed CI

After deployment:

- load `/leads`, `/autoresponder`, `/audit`, `/businesses`, `/programs`, and `/reporting`
- run the webhook verification endpoint
- run internal canary:

```bash
curl -sS -H "Authorization: Bearer $CRON_SECRET" \
  "https://YOUR_MAIN_APP/api/internal/operations/canary?http=1"
```

- run alert evaluation:

```bash
curl -sS -H "Authorization: Bearer $CRON_SECRET" \
  "https://YOUR_MAIN_APP/api/internal/operations/alerts"
```

- run reconcile with safe limits:

```bash
curl -sS -H "Authorization: Bearer $CRON_SECRET" \
  "https://YOUR_MAIN_APP/api/internal/reconcile?programJobLimit=5&leadWebhookLimit=10&scheduledReportLimit=2&reportLimit=2&reportDeliveryLimit=5&autoresponderFollowUpLimit=0&connectorLifecycleLimit=2"
```

## Failure Rules

- If fresh migration verification fails, do not deploy schema changes.
- If tests or typecheck fail, do not deploy.
- If build fails, do not deploy.
- If production canary fails after deployment, hold rollout and inspect logs before expanding traffic.
- If alert evaluation returns `CRITICAL`, do not broaden rollout until the underlying alert is understood.

## Remaining Gap

This checklist improves release discipline, but it is not a staging environment.

Still not covered:

- real Vercel runtime smoke tests before production
- production-like load tests on every release
- external error/log sink confirmation
- durable queue/dead-letter worker verification
