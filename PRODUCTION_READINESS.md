# Production Readiness

This is the release evidence ledger for the first external-client rollout. Points are awarded per independently implemented and verified requirement. An external blocker does not erase unrelated earned points.

## Verdict And Progress

- Current verdict: **Ready**
- Weighted atomic score: **100 / 100**
- Implementation completeness: **100 / 100**
- Verification completeness: **100 / 100**
- Live readiness: **10 / 10 mandatory live gates (100 / 100)**
- Release branch: `main`
- Baseline commit: `6456fdf`
- Latest application checkpoint: `bb0f66c`
- Live blocker: **None**

Every mandatory implementation, verification, provider, deployment, and controlled-live gate is now satisfied for the first external-client rollout.

Implementation completeness measures whether the required code and UI exist. Verification completeness follows the earned atomic checklist below. Live readiness is calculated only from the provider-backed, production-deployment, and controlled-live-flow requirements.

## Atomic Weighted Scorecard

### Autoresponder Pipeline And Real Delivery: 20 / 20

| Atomic requirement                                           | Points | Earned | Evidence                                                                             |
| ------------------------------------------------------------ | -----: | -----: | ------------------------------------------------------------------------------------ |
| Authenticated webhook ingestion and fast acknowledgement     |      2 |      2 | Route and webhook authentication tests                                               |
| Durable immediate background jobs                            |      2 |      2 | Database-backed worker jobs and enqueue tests                                        |
| Transactional claim and duplicate-event/send protection      |      3 |      3 | Claim, idempotency, and external-side-effect tests                                   |
| Bounded retry, rate handling, and auth circuit breaker       |      3 |      3 | Retry and credential-block tests                                                     |
| Dead-letter visibility                                       |      1 |      1 | Worker/dead-letter state implementation and tests                                    |
| Safe failed-job replay                                       |      1 |      1 | Tenant-scoped replay route, confirmation UI, and tests                               |
| Global, tenant, business switches and review/auto-send modes |      2 |      2 | Config resolution and kill-switch tests                                              |
| Correlation IDs, delivery state, and audit records           |      1 |      1 | Persisted attempts and audit assertions                                              |
| Reconciliation recovery and false-green failure exits        |      2 |      2 | HTTP 503/500 tests and fail-fast workflow                                            |
| Provider-authenticated webhook and lead synchronization      |      1 |      1 | Production reconciliation synced 60/60 leads; queued webhook completed               |
| Controlled Claude-to-Yelp reply path                         |      1 |      1 | Synthetic test lead generated once, policy fallback applied, and Yelp send succeeded |
| Verified provider reply delivery                             |      1 |      1 | Yelp read-back returned 200 and found the exact sent reply in the thread             |

### Claude-Only Generation, Usage And Limits: 15 / 15

| Atomic requirement                                         | Points | Earned | Evidence                                                                 |
| ---------------------------------------------------------- | -----: | -----: | ------------------------------------------------------------------------ |
| Claude-only runtime with no GPT fallback                   |      2 |      2 | Static runtime guard and failure tests                                   |
| Verified model IDs, global default, and operator allowlist |      2 |      2 | Model-tier config and schema tests                                       |
| Tenant/business selection stored with each generation      |      2 |      2 | Config precedence and usage persistence tests                            |
| Tokens, latency, rate snapshot, provider and billable cost |      2 |      2 | Usage record tests                                                       |
| Message, token, dollar warnings and hard stop              |      2 |      2 | Budget and hard-limit tests                                              |
| Deterministic fallback and manual review                   |      1 |      1 | Claude failure and fallback tests                                        |
| Configurable markup and invoice-ready CSV                  |      1 |      1 | Usage export tests                                                       |
| Prompt-injection boundary and reply policy validation      |      1 |      1 | Prompt and output-policy tests                                           |
| Provider-backed Claude generation                          |      1 |      1 | Live synthetic Anthropic generation succeeded                            |
| Provider-backed usage reconciliation                       |      1 |      1 | Controlled E2E persisted model, tokens, latency, rate snapshot, and cost |

### Multi-Tenant Isolation And RBAC: 15 / 15

| Atomic requirement                                     | Points | Earned | Evidence                                                |
| ------------------------------------------------------ | -----: | -----: | ------------------------------------------------------- |
| Locked six-role permission map                         |      2 |      2 | Role matrix tests                                       |
| Server-side API authorization                          |      1 |      1 | Route permission tests                                  |
| Server-rendered page authorization and role navigation |      1 |      1 | Permission guards and sidebar tests                     |
| Background-operation tenant/business scope             |      1 |      1 | Worker/reconcile/report/autoresponder scope review      |
| Tenant scope and payload/URL IDOR protection           |      2 |      2 | Authenticated tenant route tests                        |
| Agency access restricted to assigned client tenants    |      1 |      1 | UserTenantAccess resolver and negative route tests      |
| Negative cross-tenant read/write tests                 |      1 |      1 | Tenant access and route tests                           |
| Negative credential/export tests                       |      1 |      1 | Credential and usage export route tests                 |
| Negative settings/usage matrix                         |      1 |      1 | Explicit credential-write and usage-export denial tests |
| Client roles cannot receive decrypted credentials      |      1 |      1 | Safe credential view models and server-only decryption  |
| Audit trail for privileged role/settings changes       |      1 |      1 | Audit assertions                                        |
| All protected API routes have server-side guards       |      1 |      1 | Static guard inventory test                             |
| All console pages have server-side guards              |      1 |      1 | Static guard inventory test                             |

### Client Onboarding And Activation Gates: 10 / 10

| Atomic requirement                                                  | Points | Earned | Evidence                                                             |
| ------------------------------------------------------------------- | -----: | -----: | -------------------------------------------------------------------- |
| Isolated tenant and Client Admin creation with safe defaults        |      1 |      1 | Workflow and defaults tests                                          |
| Tenant selector constrained to authorized tenants                   |      1 |      1 | Tenant access and selector implementation                            |
| Guided Yelp/business connection workflow                            |      1 |      1 | Onboarding UI and provider-evidence checks                           |
| Claude tier, limits, hours, rules, and fallback workflow            |      1 |      1 | Onboarding checks and linked configuration UI                        |
| Truthful Draft/Connecting/Review/Ready/Active/Paused/Blocked states |      1 |      1 | State-transition tests                                               |
| Activation blocked until checks pass; review-only default           |      1 |      1 | Schema and readiness tests                                           |
| Server-side pause, emergency disable, and recovery                  |      1 |      1 | Transition and API tests                                             |
| Authenticated tenant and URL business scope                         |      1 |      1 | Onboarding route tests                                               |
| Guided client access provisioning and role assignment               |      1 |      1 | Tenant-scoped temporary access, client-role allowlist, audit, and UI |
| Successful live Yelp Leads/reporting connection evidence            |      1 |      1 | Production Yelp connection and 60/60 lead synchronization succeeded  |

### Yelp Campaigns, Cap, MTD And Temporary Campaigns: 10 / 10

| Atomic requirement                                     | Points | Earned | Evidence                              |
| ------------------------------------------------------ | -----: | -----: | ------------------------------------- |
| Server-side `$60,000` campaign cap                     |      1 |      1 | Boundary tests                        |
| Over-cap campaign may decrease but not increase        |      1 |      1 | Mutation policy tests                 |
| Unique upstream IDs and duplicate-local prevention     |      1 |      1 | Migration, schema, and live inventory |
| Read-only canonical inventory before mutation          |      1 |      1 | Provider-backed inventory             |
| Plumbing `$230/day` through 2026-08-31                 |      1 |      1 | Yelp read-back and idempotent NOOP    |
| Commercial HVAC `$200/day` through 2026-08-31          |      1 |      1 | Yelp read-back and idempotent NOOP    |
| Permanent four-layer split remains deferred            |      1 |      1 | Planner and live inventory            |
| Billing-period spend is not mislabeled as calendar MTD |      1 |      1 | Spend-state tests                     |
| Pacific date-range/source/currency/staleness semantics |      1 |      1 | Timezone and status tests             |
| Daily per-program snapshots for forward MTD            |      1 |      1 | Pacific snapshots and reset tests     |

### Security And Dependency Remediation: 10 / 10

| Atomic requirement                                         | Points | Earned | Evidence                                            |
| ---------------------------------------------------------- | -----: | -----: | --------------------------------------------------- |
| No known high/critical production dependency vulnerability |      1 |      1 | Production dependency audit                         |
| Login throttling and generic errors                        |      1 |      1 | Auth tests                                          |
| Secure session and logout behavior                         |      1 |      1 | Session implementation/tests                        |
| CSP and security headers                                   |      1 |      1 | Header config/build verification                    |
| CSRF review of every state-changing route                  |      1 |      1 | Guard, request-mode, and session-cookie inventory   |
| Fail-closed webhook authenticity                           |      1 |      1 | Webhook auth tests                                  |
| External credentials encrypted at rest                     |      1 |      1 | Encryption repository and migration evidence        |
| Sensitive data redacted from provider logs                 |      1 |      1 | Structured log implementation/tests                 |
| Full IDOR/privilege-escalation review                      |      1 |      1 | Protected-route inventory and negative tenant tests |
| Final production security regression                       |      1 |      1 | Full release gate and isolated production audit     |

### Tests, Migrations, Deployment And Live Verification: 10 / 10

| Atomic requirement                  | Points | Earned | Evidence                                                                                                |
| ----------------------------------- | -----: | -----: | ------------------------------------------------------------------------------------------------------- |
| Full unit/integration/browser suite |      1 |      1 | 103 files / 426 tests and authenticated Playwright visual flows passed                                  |
| Typecheck                           |      1 |      1 | `pnpm typecheck` passed                                                                                 |
| Lint and changed-file format        |      1 |      1 | Passed after latest scoped changes                                                                      |
| Production build                    |      1 |      1 | Final optimized Next.js build passed                                                                    |
| Fresh database migration            |      1 |      1 | 25 migrations passed                                                                                    |
| Existing database upgrade           |      1 |      1 | 21 legacy + 4 release migrations passed                                                                 |
| CI internal-failure behavior        |      1 |      1 | Reconcile/follow-up non-2xx tests and curl fail-fast                                                    |
| Push and deploy from `main`         |      1 |      1 | Commit `434b164` deployed to Vercel Production                                                          |
| Production smoke test               |      1 |      1 | Public and authenticated critical-route smoke passed                                                    |
| Controlled provider E2E             |      1 |      1 | Anthropic generation, policy fallback, Yelp delivery, audit, usage, idempotency, and read-back verified |

## Live Readiness Gates

| Mandatory live gate                                      | Status | Evidence                                                                        |
| -------------------------------------------------------- | ------ | ------------------------------------------------------------------------------- |
| Production deployment from `main`                        | Passed | Vercel Production serves the release                                            |
| Production migrations applied                            | Passed | All 25 migrations applied                                                       |
| Authenticated production smoke                           | Passed | Critical authenticated routes returned 200                                      |
| Yelp Leads authentication                                | Passed | Business-scoped connection succeeded                                            |
| Live lead reconciliation                                 | Passed | 60/60 leads synchronized with zero failures                                     |
| Temporary Yelp campaigns read back                       | Passed | Approved Plumbing and Commercial HVAC values match                              |
| Provider-backed Claude generation                        | Passed | Anthropic returned model and usage evidence                                     |
| Controlled Claude-to-Yelp flow                           | Passed | Synthetic test path delivered exactly once                                      |
| Yelp provider read-back, audit, and usage reconciliation | Passed | Exact reply visible; send/audit/usage records succeeded                         |
| Anthropic configured in deployed Vercel runtime          | Passed | Authenticated production UI and a non-sending Claude draft generation succeeded |

### Health, Observability And Recovery: 5 / 5

| Atomic requirement                                        | Points | Earned | Evidence                                    |
| --------------------------------------------------------- | -----: | -----: | ------------------------------------------- |
| Readiness uses real business-scoped provider evidence     |      1 |      1 | Leads/Ads/reporting evidence implementation |
| Worker heartbeat, queue depth/age, and failure categories |      1 |      1 | Operations UI and repositories              |
| Credential-blocked state and retry circuit visibility     |      1 |      1 | Circuit/health tests                        |
| Client-safe status and operator remediation details       |      1 |      1 | Onboarding/health UI                        |
| Reconcile/worker/CI fail non-green on internal failure    |      1 |      1 | Durable/app failure route tests             |

### UI, UX, Accessibility And Performance: 5 / 5

| Atomic requirement                                     | Points | Earned | Evidence                                                       |
| ------------------------------------------------------ | -----: | -----: | -------------------------------------------------------------- |
| Role-aware navigation and inaccessible controls hidden |      1 |      1 | Sidebar tests                                                  |
| Guided onboarding, confirmations, blocked/error states |      1 |      1 | Onboarding UI and API                                          |
| Desktop visual verification                            |      1 |      1 | Five critical screens visually inspected at 1440x1000          |
| Mobile/keyboard/accessibility verification             |      1 |      1 | Five critical screens checked at 390x844; audit overflow fixed |
| Critical-page performance verification                 |      1 |      1 | Warm local SSR checks below one second per critical route      |

## Evidence Log

| Time (UTC) | Evidence                  | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ---------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2026-08-24 | Git inspection            | Work preserved in writable `main` checkout; checkpoint `df40943` on baseline `6456fdf`.                                                                                                                                                                                                                                                                                                                                                                |
| 2026-08-24 | Environment inspection    | Required Anthropic/Yelp keys detected without printing values.                                                                                                                                                                                                                                                                                                                                                                                         |
| 2026-08-24 | Claude model verification | `claude-haiku-4-5`, `claude-sonnet-4-6`, and `claude-opus-4-6` verified for the configured SDK contract.                                                                                                                                                                                                                                                                                                                                               |
| 2026-08-24 | Tests                     | 92 test files / 372 tests passed.                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 2026-08-24 | Typecheck/lint/format     | Final typecheck, route generation, lint, and changed-file Prettier check passed.                                                                                                                                                                                                                                                                                                                                                                       |
| 2026-08-24 | Migrations                | Fresh database applied 25 migrations; existing database applied 21 legacy plus 4 release migrations.                                                                                                                                                                                                                                                                                                                                                   |
| 2026-08-24 | Dependency audit          | Yelp application production tree, isolated from the parent workspace with `--ignore-workspace`, returned no known vulnerabilities.                                                                                                                                                                                                                                                                                                                     |
| 2026-08-24 | Production build          | Optimized Next.js 15.5.21 build compiled successfully and generated all 60 static pages.                                                                                                                                                                                                                                                                                                                                                               |
| 2026-08-24 | Yelp Program List         | Canonical destination identified read-only; 177 programs, 11 active, zero duplicate upstream IDs, provider errors 0.                                                                                                                                                                                                                                                                                                                                   |
| 2026-08-24 | Temporary campaigns       | Plumbing and Commercial HVAC match approved budgets/end date; no mutation was performed during re-verification.                                                                                                                                                                                                                                                                                                                                        |
| 2026-08-24 | Yelp Leads authentication | Canonical business `GET /v3/businesses/{businessId}/lead_ids?limit=1` returned `401 AUTH_FAILURE`; failing source is tenant `REPORTING_FUSION`. No IDs, tokens, or lead data were logged by the diagnostic script.                                                                                                                                                                                                                                     |
| 2026-08-24 | MTD semantics             | Program List `ad_cost` remains explicitly billing-period spend. Pacific daily snapshots now provide forward MTD after a prior-month baseline; historical MTD remains provider-blocked.                                                                                                                                                                                                                                                                 |
| 2026-08-24 | Anthropic live check      | Minimal synthetic generation succeeded with `claude-opus-4-6`; usage and latency were returned without logging generated text or secrets.                                                                                                                                                                                                                                                                                                              |
| 2026-08-24 | CI failure behavior       | Reconcile returns 503 for durable/application failures, follow-up worker returns non-2xx, and GitHub Actions uses `curl --fail-with-body`; five focused tests passed.                                                                                                                                                                                                                                                                                  |
| 2026-08-24 | Authorization inventory   | 75 API route files (2 public auth endpoints, 73 protected) and 21 console pages passed static server-guard coverage; role, tenant-access, tenant-switch, and cross-tenant tests passed.                                                                                                                                                                                                                                                                |
| 2026-08-24 | Worker recovery           | Dead-letter replay is tenant-scoped, race-safe, audited, confirmation-gated, and covered by route/workflow tests.                                                                                                                                                                                                                                                                                                                                      |
| 2026-08-24 | Visual QA                 | Onboarding, programs, autoresponder, settings, and audit returned HTTP 200 on a fresh migrated database at desktop/mobile sizes; screenshots inspected; no page-level horizontal overflow remains.                                                                                                                                                                                                                                                     |
| 2026-08-24 | Page performance          | Warm local SSR navigation measured approximately 0.7-0.9 seconds for all five critical routes on the isolated release database.                                                                                                                                                                                                                                                                                                                        |
| 2026-08-24 | Browser E2E               | Six authenticated production-flow scenarios passed on a fresh isolated database: create CPC, budget update, terminate, feature update, report request, and settings boundary.                                                                                                                                                                                                                                                                          |
| 2026-08-24 | Development CSP           | Next.js development hydration is enabled with development-only `unsafe-eval`; the production CSP remains strict and is rechecked by the optimized production build.                                                                                                                                                                                                                                                                                    |
| 2026-08-24 | CSRF route review         | Browser mutations use JSON-only requests or bodyless POST under an HttpOnly, Secure-in-production, SameSite=Lax session; every protected mutation has a server permission guard, while cron/webhook routes use separate bearer/signature authentication.                                                                                                                                                                                               |
| 2026-09-01 | September Yelp campaigns  | Main $9,900 read-back explicitly approved. Plumbing `ZKnDBk9eS2jJa7Xi3a3Cjg` is active at $15,000 through Sep 30. Boost `80ss91a6TCoIZ4qHnDI5Gg` is provider-verified at $5,000 for Sep 25-30 across HVAC, Plumbing, and Water Heater. No duplicate upstream IDs. Program Features credentials now pass HTTP 200 read-only checks and are stored encrypted; HVAC apply awaits exact assignment of existing $12K program.                               |
| 2026-09-01 | Release verification      | Fresh 26-migration deploy and seed passed; 21 legacy plus 5 upgrade migrations and data transformations passed; format, 420 tests, typecheck, lint, production build, and production dependency audit passed with no known vulnerabilities.                                                                                                                                                                                                            |
| 2026-09-01 | Boost focus controls      | Five allowlisted service switches, fixed Yelp-derived targeting presets, permission-scoped API, stale-keyword clearing, and provider read-back were implemented. 103 files / 426 tests, typecheck, lint, build, and isolated 26-migration visual database passed. Desktop 1440px and mobile 390px screenshots had zero horizontal overflow; no live Boost mutation was made during QA.                                                                 |
| 2026-08-24 | Exact-SHA CI              | GitHub Production Readiness run `32725349076` passed fresh/upgrade migrations, format, 372 tests, typecheck, lint, and production build for commit `434b164`.                                                                                                                                                                                                                                                                                          |
| 2026-08-24 | Production deploy         | Vercel reported successful Production deployment `6062348630` for commit `434b164`; canonical production alias serves the release.                                                                                                                                                                                                                                                                                                                     |
| 2026-08-24 | Production migrations     | Four pending, previously verified release migrations were applied successfully to the configured production Neon database; all 25 migrations are now applied.                                                                                                                                                                                                                                                                                          |
| 2026-08-24 | Production smoke          | Canonical login and webhook challenge returned 200; authenticated onboarding, programs, autoresponder, settings, and audit routes returned 200 without application/database errors.                                                                                                                                                                                                                                                                    |
| 2026-08-24 | Agency scope verification | Four focused tenant-access, tenant-switch, cross-tenant route, and authorization inventory files passed 14 tests; assigned client-tenant access scopes every downstream business operation.                                                                                                                                                                                                                                                            |
| 2026-08-24 | Yelp Leads recheck        | Both configured production business scopes returned HTTP 401 `AUTH_FAILURE` from `GET /v3/businesses/{businessId}/lead_ids?limit=1` using tenant `REPORTING_FUSION` credentials. No business IDs or lead data were logged.                                                                                                                                                                                                                             |
| 2026-08-24 | Client access onboarding  | Guided onboarding provisions tenant-scoped users with temporary credentials and client-only role selection; creation and role routes passed 16 focused tests, and desktop/mobile visual QA found no overflow.                                                                                                                                                                                                                                          |
| 2026-08-25 | Yelp Leads authentication | Production business-scoped authentication succeeded with the current tenant credential; no credentials or lead content were logged.                                                                                                                                                                                                                                                                                                                    |
| 2026-08-25 | Live lead reconciliation  | Production reconciliation processed 60 leads across three pages: 60 updated, zero failed, and zero access failures.                                                                                                                                                                                                                                                                                                                                    |
| 2026-08-25 | Webhook recovery          | A real queued Yelp webhook was claimed and completed after the operational-metric overflow fix; worker and follow-up jobs completed successfully.                                                                                                                                                                                                                                                                                                      |
| 2026-08-25 | Metric overflow fix       | Operational metric values were migrated from integer to bigint; 96 test files / 379 tests, typecheck, lint, format, and production build passed.                                                                                                                                                                                                                                                                                                       |
| 2026-08-25 | Exact-SHA CI              | GitHub Production Readiness run `32857657768` passed fresh and upgrade migrations, format, 379 tests, typecheck, lint, and production build for commit `072a8a3`.                                                                                                                                                                                                                                                                                      |
| 2026-08-25 | Production deploy         | Vercel production deployment for `072a8a3` succeeded; migration `20260825141000_operational_metric_bigint` is applied and post-deploy reconciliation run `32857880565` succeeded.                                                                                                                                                                                                                                                                      |
| 2026-08-25 | Controlled provider E2E   | An explicitly marked synthetic lead under the test business produced one successful Anthropic usage record (`claude-haiku-4-5`, 775 input and 83 output tokens), applied the `AI_RISK_GUARDRAIL` deterministic fallback, created exactly one successful Yelp send action/side effect, recorded a successful audit, and suppressed the duplicate invocation. No lead content or upstream IDs were logged.                                               |
| 2026-08-25 | Yelp delivery read-back   | A read-only Yelp events request returned HTTP 200 and confirmed the exact sent fallback reply is present in the synthetic lead thread.                                                                                                                                                                                                                                                                                                                 |
| 2026-08-25 | Deployment Claude gate    | Authenticated Vercel Production `/autoresponder` reports that Anthropic is not configured. Server-side onboarding now includes a mandatory Claude runtime check and blocks readiness/activation while it is absent.                                                                                                                                                                                                                                    |
| 2026-08-25 | Final scoped regression   | 96 test files / 380 tests, typecheck, lint, changed-file format, and optimized 60-page production build passed for the Claude runtime activation gate.                                                                                                                                                                                                                                                                                                 |
| 2026-08-25 | Production Claude runtime | After the Production environment update and redeploy, authenticated `/autoresponder` and `/onboarding` returned HTTP 200 without the missing-Anthropic state. A non-sending Production `/reply-draft` request for an explicitly marked synthetic lead succeeded with `claude-haiku-4-5`, persisted 638 input and 181 output tokens, latency, provider/billable cost, and a successful audit. No reply was sent and no lead content or IDs were logged. |

## Final Live State

Yelp authentication, production deployment, migrations, lead synchronization, queued-webhook processing, provider-backed Claude generation, safe fallback policy, exactly-once Yelp delivery, audit/usage persistence, Yelp read-back, and the deployed Vercel Anthropic runtime are live-verified.

The release is **Ready** for the first external-client onboarding under the implemented review-only default, usage limits, activation checks, tenant isolation, and emergency controls. Broader rollout should retain the same per-client readiness checks rather than bypassing activation gates.
