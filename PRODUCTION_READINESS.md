# Production Readiness

This is the release evidence ledger for the first external-client rollout. Points are awarded per independently implemented and verified requirement. An external blocker does not erase unrelated earned points.

## Verdict And Progress

- Current verdict: **Not Ready**
- Weighted atomic score: **90 / 100**
- Implementation completeness: **91 / 100**
- Verification completeness: **91 / 100**
- Live readiness: **35 / 100**
- Release branch: `main`
- Baseline commit: `6456fdf`
- Latest checkpoint: `df40943`
- Live blocker: the canonical business-scoped Yelp Leads read returns `401 AUTH_FAILURE` using the tenant `REPORTING_FUSION` bearer credential.

`Ready` still requires every mandatory release gate, production deployment, and a controlled live Claude-to-Yelp delivery.

## Atomic Weighted Scorecard

### Autoresponder Pipeline And Real Delivery: 17 / 20

| Atomic requirement                                           | Points | Earned | Evidence                                               |
| ------------------------------------------------------------ | -----: | -----: | ------------------------------------------------------ |
| Authenticated webhook ingestion and fast acknowledgement     |      2 |      2 | Route and webhook authentication tests                 |
| Durable immediate background jobs                            |      2 |      2 | Database-backed worker jobs and enqueue tests          |
| Transactional claim and duplicate-event/send protection      |      3 |      3 | Claim, idempotency, and external-side-effect tests     |
| Bounded retry, rate handling, and auth circuit breaker       |      3 |      3 | Retry and credential-block tests                       |
| Dead-letter visibility                                       |      1 |      1 | Worker/dead-letter state implementation and tests      |
| Safe failed-job replay                                       |      1 |      1 | Tenant-scoped replay route, confirmation UI, and tests |
| Global, tenant, business switches and review/auto-send modes |      2 |      2 | Config resolution and kill-switch tests                |
| Correlation IDs, delivery state, and audit records           |      1 |      1 | Persisted attempts and audit assertions                |
| Reconciliation recovery and false-green failure exits        |      2 |      2 | HTTP 503/500 tests and fail-fast workflow              |
| Controlled webhook-to-Claude-to-Yelp E2E                     |      2 |      0 | Blocked by Yelp Leads authentication                   |
| Verified provider delivery                                   |      1 |      0 | Blocked by Yelp Leads authentication                   |

### Claude-Only Generation, Usage And Limits: 14 / 15

| Atomic requirement                                         | Points | Earned | Evidence                                      |
| ---------------------------------------------------------- | -----: | -----: | --------------------------------------------- |
| Claude-only runtime with no GPT fallback                   |      2 |      2 | Static runtime guard and failure tests        |
| Verified model IDs, global default, and operator allowlist |      2 |      2 | Model-tier config and schema tests            |
| Tenant/business selection stored with each generation      |      2 |      2 | Config precedence and usage persistence tests |
| Tokens, latency, rate snapshot, provider and billable cost |      2 |      2 | Usage record tests                            |
| Message, token, dollar warnings and hard stop              |      2 |      2 | Budget and hard-limit tests                   |
| Deterministic fallback and manual review                   |      1 |      1 | Claude failure and fallback tests             |
| Configurable markup and invoice-ready CSV                  |      1 |      1 | Usage export tests                            |
| Prompt-injection boundary and reply policy validation      |      1 |      1 | Prompt and output-policy tests                |
| Provider-backed Claude generation                          |      1 |      1 | Live synthetic Anthropic generation succeeded |
| Provider-backed usage reconciliation                       |      1 |      0 | Controlled live E2E pending                   |

### Multi-Tenant Isolation And RBAC: 14 / 15

| Atomic requirement                                     | Points | Earned | Evidence                                                |
| ------------------------------------------------------ | -----: | -----: | ------------------------------------------------------- |
| Locked six-role permission map                         |      2 |      2 | Role matrix tests                                       |
| Server-side API authorization                          |      1 |      1 | Route permission tests                                  |
| Server-rendered page authorization and role navigation |      1 |      1 | Permission guards and sidebar tests                     |
| Background-operation tenant/business scope             |      1 |      1 | Worker/reconcile/report/autoresponder scope review      |
| Tenant scope and payload/URL IDOR protection           |      2 |      2 | Authenticated tenant route tests                        |
| Assigned-business restriction for agency operators     |      1 |      0 | Complete assignment matrix pending                      |
| Negative cross-tenant read/write tests                 |      1 |      1 | Tenant access and route tests                           |
| Negative credential/export tests                       |      1 |      1 | Credential and usage export route tests                 |
| Negative settings/usage matrix                         |      1 |      1 | Explicit credential-write and usage-export denial tests |
| Client roles cannot receive decrypted credentials      |      1 |      1 | Safe credential view models and server-only decryption  |
| Audit trail for privileged role/settings changes       |      1 |      1 | Audit assertions                                        |
| All protected API routes have server-side guards       |      1 |      1 | Static guard inventory test                             |
| All console pages have server-side guards              |      1 |      1 | Static guard inventory test                             |

### Client Onboarding And Activation Gates: 8 / 10

| Atomic requirement                                                  | Points | Earned | Evidence                                           |
| ------------------------------------------------------------------- | -----: | -----: | -------------------------------------------------- |
| Isolated tenant and Client Admin creation with safe defaults        |      1 |      1 | Workflow and defaults tests                        |
| Tenant selector constrained to authorized tenants                   |      1 |      1 | Tenant access and selector implementation          |
| Guided Yelp/business connection workflow                            |      1 |      1 | Onboarding UI and provider-evidence checks         |
| Claude tier, limits, hours, rules, and fallback workflow            |      1 |      1 | Onboarding checks and linked configuration UI      |
| Truthful Draft/Connecting/Review/Ready/Active/Paused/Blocked states |      1 |      1 | State-transition tests                             |
| Activation blocked until checks pass; review-only default           |      1 |      1 | Schema and readiness tests                         |
| Server-side pause, emergency disable, and recovery                  |      1 |      1 | Transition and API tests                           |
| Authenticated tenant and URL business scope                         |      1 |      1 | Onboarding route tests                             |
| Complete invitation/user assignment step                            |      1 |      0 | Existing tenant user invitation remains incomplete |
| Successful live Yelp Leads/reporting connection evidence            |      1 |      0 | Yelp Leads returns 401                             |

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

### Tests, Migrations, Deployment And Live Verification: 7 / 10

| Atomic requirement                  | Points | Earned | Evidence                                             |
| ----------------------------------- | -----: | -----: | ---------------------------------------------------- |
| Full unit/integration/browser suite |      1 |      1 | 92 files / 372 tests and 6 Playwright flows passed   |
| Typecheck                           |      1 |      1 | `pnpm typecheck` passed                              |
| Lint and changed-file format        |      1 |      1 | Passed after latest scoped changes                   |
| Production build                    |      1 |      1 | Final optimized Next.js build passed                 |
| Fresh database migration            |      1 |      1 | 25 migrations passed                                 |
| Existing database upgrade           |      1 |      1 | 21 legacy + 4 release migrations passed              |
| CI internal-failure behavior        |      1 |      1 | Reconcile/follow-up non-2xx tests and curl fail-fast |
| Push and deploy from `main`         |      1 |      0 | Not pushed or deployed                               |
| Production smoke test               |      1 |      0 | Deployment pending                                   |
| Controlled provider E2E             |      1 |      0 | Yelp Leads auth blocked                              |

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

| Time (UTC) | Evidence                  | Result                                                                                                                                                                                                                                                   |
| ---------- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-08-24 | Git inspection            | Work preserved in writable `main` checkout; checkpoint `df40943` on baseline `6456fdf`.                                                                                                                                                                  |
| 2026-08-24 | Environment inspection    | Required Anthropic/Yelp keys detected without printing values.                                                                                                                                                                                           |
| 2026-08-24 | Claude model verification | `claude-haiku-4-5`, `claude-sonnet-4-6`, and `claude-opus-4-6` verified for the configured SDK contract.                                                                                                                                                 |
| 2026-08-24 | Tests                     | 92 test files / 372 tests passed.                                                                                                                                                                                                                        |
| 2026-08-24 | Typecheck/lint/format     | Final typecheck, route generation, lint, and changed-file Prettier check passed.                                                                                                                                                                         |
| 2026-08-24 | Migrations                | Fresh database applied 25 migrations; existing database applied 21 legacy plus 4 release migrations.                                                                                                                                                     |
| 2026-08-24 | Dependency audit          | Yelp application production tree, isolated from the parent workspace with `--ignore-workspace`, returned no known vulnerabilities.                                                                                                                       |
| 2026-08-24 | Production build          | Optimized Next.js 15.5.21 build compiled successfully and generated all 60 static pages.                                                                                                                                                                 |
| 2026-08-24 | Yelp Program List         | Canonical destination identified read-only; 177 programs, 11 active, zero duplicate upstream IDs, provider errors 0.                                                                                                                                     |
| 2026-08-24 | Temporary campaigns       | Plumbing and Commercial HVAC match approved budgets/end date; no mutation was performed during re-verification.                                                                                                                                          |
| 2026-08-24 | Yelp Leads authentication | Canonical business `GET /v3/businesses/{businessId}/lead_ids?limit=1` returned `401 AUTH_FAILURE`; failing source is tenant `REPORTING_FUSION`. No IDs, tokens, or lead data were logged by the diagnostic script.                                       |
| 2026-08-24 | MTD semantics             | Program List `ad_cost` remains explicitly billing-period spend. Pacific daily snapshots now provide forward MTD after a prior-month baseline; historical MTD remains provider-blocked.                                                                   |
| 2026-08-24 | Anthropic live check      | Minimal synthetic generation succeeded with `claude-opus-4-6`; usage and latency were returned without logging generated text or secrets.                                                                                                                |
| 2026-08-24 | CI failure behavior       | Reconcile returns 503 for durable/application failures, follow-up worker returns non-2xx, and GitHub Actions uses `curl --fail-with-body`; five focused tests passed.                                                                                    |
| 2026-08-24 | Authorization inventory   | 75 API route files (2 public auth endpoints, 73 protected) and 21 console pages passed static server-guard coverage; role, tenant-access, tenant-switch, and cross-tenant tests passed.                                                                  |
| 2026-08-24 | Worker recovery           | Dead-letter replay is tenant-scoped, race-safe, audited, confirmation-gated, and covered by route/workflow tests.                                                                                                                                        |
| 2026-08-24 | Visual QA                 | Onboarding, programs, autoresponder, settings, and audit returned HTTP 200 on a fresh migrated database at desktop/mobile sizes; screenshots inspected; no page-level horizontal overflow remains.                                                       |
| 2026-08-24 | Page performance          | Warm local SSR navigation measured approximately 0.7-0.9 seconds for all five critical routes on the isolated release database.                                                                                                                          |
| 2026-08-24 | Browser E2E               | Six authenticated production-flow scenarios passed on a fresh isolated database: create CPC, budget update, terminate, feature update, report request, and settings boundary.                                                                            |
| 2026-08-24 | Development CSP           | Next.js development hydration is enabled with development-only `unsafe-eval`; the production CSP remains strict and is rechecked by the optimized production build.                                                                                      |
| 2026-08-24 | CSRF route review         | Browser mutations use JSON-only requests or bodyless POST under an HttpOnly, Secure-in-production, SameSite=Lax session; every protected mutation has a server permission guard, while cron/webhook routes use separate bearer/signature authentication. |

## Current Blocker

Replace or reauthorize the enabled tenant `REPORTING_FUSION` bearer credential with a Yelp credential that is valid for Leads API v3, then rerun the business-scoped Leads check. A `401` indicates rejected authentication; if the replacement returns `403`, Yelp must grant the application/business Leads API permission.

No release exception is approved. Until the live gate passes, the product remains **Not Ready** regardless of local test coverage.
