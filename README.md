# Yelp Ads Console

Internal admin platform for non-technical staff to operate Yelp Ads partner workflows through a safe UI. The app is a modular monolith built with Next.js App Router, TypeScript, Tailwind, shadcn-style UI primitives, Prisma/PostgreSQL, React Hook Form, TanStack Query, and server-only Yelp adapters.

## What it covers

- Business search, selection, onboarding readiness, and encrypted Yelp business ID handling
- Async ad program create, edit, terminate, and job polling workflows
- Program feature management with dedicated feature forms and delete semantics
- Daily and monthly reporting requests, polling, caching, charting, and CSV export
- Admin settings for credentials, capability flags, role-based access, and audit history
- Environment-aware capability states that explicitly show `Not enabled by Yelp / missing credentials`

## Project structure

```text
app/
components/
features/
lib/
prisma/
tests/
```

Key server-only integration files:

- `lib/yelp/ads-client.ts`
- `lib/yelp/features-client.ts`
- `lib/yelp/reporting-client.ts`
- `lib/yelp/business-match-client.ts`
- `lib/yelp/data-ingestion-client.ts`
- `lib/yelp/errors.ts`
- `lib/yelp/schemas.ts`
- `lib/yelp/mappers.ts`

Additional documentation:

- `docs/console-feature-reference.md` for current UI inputs, internal routes, Yelp payload mappings, outputs, and side effects

## Setup

1. Install dependencies:

```bash
pnpm install
```

2. Copy env vars and edit secrets:

```bash
cp .env.example .env
```

3. Start PostgreSQL locally:

```bash
docker compose up -d
```

4. Generate Prisma client, apply the initial migration, and seed demo data:

```bash
XDG_CACHE_HOME=/tmp/prisma-cache pnpm exec prisma generate
XDG_CACHE_HOME=/tmp/prisma-cache pnpm exec prisma migrate deploy
pnpm prisma:seed
```

5. Start the app:

```bash
pnpm dev
```

Default demo login when `DEMO_MODE=true`:

- Email: `admin@yelp-console.local`
- Password: `ChangeMe123!`

## Environment variables

Required:

- `DATABASE_URL`
- `SESSION_SECRET`
- `APP_ENCRYPTION_KEY`

Useful optional values:

- `DEMO_MODE=true` to seed and operate with local demo behavior when live Yelp APIs are disabled
- `DEFAULT_TENANT_SLUG=default`
- `CRON_SECRET` to secure the internal reconciliation endpoint used by Vercel Cron
- `SEED_ADMIN_EMAIL` and `SEED_ADMIN_NAME` to control the initial seeded admin identity
- `YELP_*_BASE_URL` overrides for different environments

## Credentials and capabilities

Admin Settings includes:

- Partner API Basic Auth credentials
- Fusion API key for reporting
- Optional Business Match and Data Ingestion credentials
- Capability flags:
  - `adsApiEnabled`
  - `programFeatureApiEnabled`
  - `reportingApiEnabled`
  - `dataIngestionApiEnabled`
  - `businessMatchApiEnabled`
  - `demoModeEnabled`

Secrets are encrypted server-side with AES-GCM and never rendered back after save.

## Migrations

The repository includes:

- Prisma schema: `prisma/schema.prisma`
- Initial SQL migration: `prisma/migrations/0001_init/migration.sql`

Use these commands during development:

```bash
pnpm prisma:migrate:dev
pnpm prisma:generate
```

## Testing

Unit and integration:

```bash
pnpm test
```

End-to-end:

```bash
pnpm test:e2e
```

Other checks:

```bash
pnpm typecheck
pnpm lint
pnpm build
```

## Local behavior vs live Yelp behavior

- Real Yelp integrations are implemented behind typed server-only clients and capability checks.
- If a capability is disabled or credentials are missing, the UI shows an explicit unavailable state instead of failing silently.
- `DEMO_MODE=true` allows local staff workflow testing without replacing the real integration boundaries.

## Deployment notes

- Use PostgreSQL in the target environment.
- Set strong production values for `SESSION_SECRET` and `APP_ENCRYPTION_KEY`.
- Set a strong `CRON_SECRET` and keep Vercel Cron enabled for `/api/internal/reconcile`.
- Save credentials per tenant through the admin UI after deployment.
- Keep all Yelp credentials server-side only.
- Review audit logs regularly for destructive actions and failed jobs.
- Use separate databases, or at minimum separate tenants plus secrets, for preview and production environments.
- Ensure your deployment process runs `pnpm prisma:migrate:deploy` before serving traffic.
- Use a pooled PostgreSQL connection strategy for Vercel serverless runtime.

## Known live-account TODOs

- Confirm exact Yelp partner endpoint paths per enabled account if they differ from the default templates in `lib/yelp/endpoints.ts`.
- Populate real Partner API and Fusion credentials in Admin Settings.
- Enable the relevant Yelp capability flags per environment and tenant after Yelp confirms access.
