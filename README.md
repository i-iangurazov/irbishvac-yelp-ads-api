# Yelp Operations Console

Internal admin platform for non-technical staff to operate Yelp Ads partner workflows, lead operations, reporting, and CRM enrichment through a safe UI. The app is a modular monolith built with Next.js App Router, TypeScript, Tailwind, shadcn-style UI primitives, Prisma/PostgreSQL, React Hook Form, TanStack Query, and server-only Yelp adapters.

## What it covers

- Business search, selection, onboarding readiness, and encrypted Yelp business ID handling
- Async ad program create, edit, terminate, and job polling workflows
- Program feature management with dedicated feature forms and delete semantics
- Daily and monthly reporting requests, polling, caching, charting, and CSV export
- Operations-foundation models for Yelp leads, webhook deliveries, CRM mappings, sync runs, locations, and service categories
- Unified top-level navigation for Ads, Leads, Reporting, Locations, Services, Integrations, and Audit / Sync Logs
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
- `CRON_SECRET` to secure the internal reconciliation endpoint used by GitHub Actions or any external scheduler
- `SEED_ADMIN_EMAIL` and `SEED_ADMIN_NAME` to control the initial seeded admin identity
- `YELP_*_BASE_URL` overrides for different environments
- `YELP_ACCESS_TOKEN` as the preferred bearer-token fallback for Yelp Leads and other bearer-auth Yelp Partner API reads
- `YELP_API_KEY` as a legacy bearer-token fallback name if your team still stores the same token under that env var
- `YELP_CLIENT_ID`, `YELP_CLIENT_SECRET`, and `YELP_REDIRECT_URI` for future Yelp OAuth or business-access flows
- `YELP_ALLOWED_BUSINESS_IDS` for future business-access allowlisting or subscription-coverage logic

## Credentials and capabilities

Admin Settings includes:

- Partner API Basic Auth credentials
- Yelp API bearer token for Leads and other bearer-auth Yelp APIs
- Optional Business Match and Data Ingestion credentials
- Env-var mapping guidance so teams can map existing values like `YELP_API_KEY` to the correct credential form
- Capability flags:
  - `hasAdsApi`
  - `hasLeadsApi`
  - `hasReportingApi`
  - `hasConversionsApi`
  - `hasPartnerSupportApi`
  - `hasCrmIntegration`
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
- Set a strong `CRON_SECRET` and keep an external scheduler enabled for `/api/internal/reconcile`.
- Save credentials per tenant through the admin UI after deployment.
- Keep all Yelp credentials server-side only.
- Review audit logs regularly for destructive actions and failed jobs.
- Use separate databases, or at minimum separate tenants plus secrets, for preview and production environments.
- Ensure your deployment process runs `pnpm prisma:migrate:deploy` before serving traffic.
- Use a pooled PostgreSQL connection strategy for Vercel serverless runtime.
- This repository includes [`.github/workflows/reconcile.yml`](/Users/ilias_iangurazov/Commercial/irbishvac-yelp-ads-api/.github/workflows/reconcile.yml) to call the internal reconcile endpoint every 5 minutes from GitHub Actions.
- Configure these GitHub repository secrets:
  - `RECONCILE_URL`: your deployed URL plus `/api/internal/reconcile`
  - `CRON_SECRET`: the same value configured in Vercel

## Known live-account TODOs

- Confirm exact Yelp partner endpoint paths per enabled account if they differ from the default templates in `lib/yelp/endpoints.ts`.
- Populate real Partner API and Fusion credentials in Admin Settings.
- Enable the relevant Yelp capability flags per environment and tenant after Yelp confirms access.

## Operations foundation

Phase 1 extends the existing Ads console with additive operational models and top-level IA without replacing the existing Ads flows:

- `Business` and `Program` remain the existing Yelp-native Ads tables.
- New normalized models cover `Location`, `ServiceCategory`, `YelpLead`, `YelpLeadEvent`, `YelpWebhookEvent`, `YelpReportingJob`, `YelpReportingSnapshot`, `CrmLeadMapping`, `CrmStatusEvent`, `SyncRun`, and `SyncError`.
- Yelp remains the source of truth for lead creation, interaction events, and delayed reporting payloads.
- CRM remains the source of truth for downstream lifecycle states such as `Scheduled`, `Job in Progress`, and `Completed`.
