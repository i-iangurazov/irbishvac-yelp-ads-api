# Production Readiness

This document is the release evidence ledger for the first external-client rollout. A category receives points only after implementation and the listed verification evidence both exist.

## Verdict

- Current verdict: Not Ready
- Current verified score: 0 / 100
- Release branch: `main`
- Baseline commit: `6456fdf`
- Live blocker: Yelp Leads credentials previously returned `AUTH_FAILURE`; a successful provider-backed check is required before activation.

## Weighted Scorecard

| Category                                            |  Weight | Verified | Required evidence                                                                                              |
| --------------------------------------------------- | ------: | -------: | -------------------------------------------------------------------------------------------------------------- |
| Autoresponder pipeline and real delivery            |      20 |        0 | Controlled webhook-to-delivery E2E, duplicate-event test, durable job evidence, live/control Yelp delivery     |
| Claude-only generation, usage and limits            |      15 |        0 | Claude success/failure tests, no-GPT proof, token/cost records, limits, export                                 |
| Multi-tenant isolation and RBAC                     |      15 |        0 | Role matrix plus negative Tenant A/Tenant B read/write/export tests                                            |
| Client onboarding and activation gates              |      10 |        0 | Guided flow, blocked activation tests, review-only default                                                     |
| Yelp campaigns, cap, MTD and temporary campaigns    |      10 |        0 | Boundary/idempotency/timezone tests and Yelp read-after-write                                                  |
| Security and dependency remediation                 |      10 |        0 | Production audit, auth/CSRF/webhook/credential/log review, no unresolved high/critical issue without exception |
| Tests, migrations, deployment and live verification |      10 |        0 | Full tests, typecheck, lint, build, fresh and upgrade migration, CI, deploy                                    |
| Health, observability and recovery                  |       5 |        0 | Truthful readiness, queue/worker/credential states, retry and replay evidence                                  |
| UI, UX, accessibility and performance               |       5 |        0 | Role-based desktop/mobile Playwright screenshots and performance checks                                        |
| **Total**                                           | **100** |    **0** |                                                                                                                |

## Locked Release Checklist

### Campaigns

- [x] Enforce a server-side `$60,000` monthly cap per campaign.
- [x] Allow an over-cap campaign to be reduced, never increased.
- [x] Deduplicate local records by upstream Yelp program ID.
- [ ] Report date-bounded MTD spend with timezone, source, currency, sync and error state.
- [x] Idempotently enable Plumbing at `$230/day` through 2026-08-31.
- [x] Idempotently enable temporary Commercial HVAC at `$200/day` through 2026-08-31.
- [x] Defer the permanent HVAC taxonomy split.
- [x] Inventory before mutation and Yelp read-back after mutation.
- [x] Audit every live mutation.

### Claude And Usage

- [ ] No OpenAI/GPT call in lead generation, reply, summary or fallback paths.
- [ ] Global default comes from `CLAUDE_REPLY_MODEL`; selectable models use an operator allowlist.
- [ ] Tenant/business selection stores the selected model with each generation.
- [ ] Persist token usage, latency, price snapshot, estimated provider cost and result.
- [ ] Enforce monthly message, token and dollar warning/hard limits.
- [ ] Deterministic fallback and visible manual review when Claude is unavailable or blocked.
- [ ] Agency markup remains configurable and is not an invented price.
- [ ] Invoice-ready monthly usage export.
- [ ] Prompt-injection boundaries and generated-content policy validation.

### Pipeline And Operations

- [ ] Fast authenticated webhook acknowledgement and durable immediate background processing.
- [ ] Transactional job claiming, duplicate prevention and correlation IDs.
- [ ] Bounded retry, provider rate limits, auth circuit breaker and no retry storm.
- [ ] Dead-letter visibility and safe replay.
- [ ] Global, tenant and business kill switches.
- [ ] Review-only and bounded auto-send modes with truthful provider delivery state.
- [ ] Reconciliation is recovery, not the only real-time path.

### Tenant Isolation And RBAC

- [ ] Implement the locked six-role matrix and server-side permission checks.
- [ ] Scope every repository read/write/export and worker operation by tenant/business.
- [ ] Prevent URL and payload IDOR.
- [ ] Client roles never receive decrypted credentials.
- [ ] Immutable audit events for privileged actions.
- [ ] Cross-tenant negative tests for campaigns, leads, credentials, settings, usage and exports.

### Onboarding

- [ ] Guided tenant, business, user, Yelp, Claude plan and policy workflow.
- [ ] Connection tests and final readiness checklist.
- [ ] Review-only default and activation blocked until checks pass.
- [ ] Business activation, pause and emergency disable.
- [ ] Draft, Connecting, Review Required, Ready, Active, Paused and Blocked states.

### Security, Health And Release

- [ ] Patched compatible production dependencies and reviewed residual advisories.
- [ ] Login throttling, generic errors, secure cookie/logout and CSP/security headers.
- [ ] CSRF and webhook authenticity review.
- [ ] Credentials encrypted at rest and sensitive data redacted from logs.
- [ ] Truthful credential, webhook, sync, Claude, send, queue and worker health.
- [ ] Full test, typecheck, lint, format, build and migration gates.
- [ ] Desktop/mobile visual verification for every role and critical state.
- [ ] Deploy from `main`, production smoke test and rollback/emergency-pause procedure.

## Evidence Log

| Time (UTC) | Evidence                    | Result                                                                                                                                                                                                 |
| ---------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2026-08-24 | Git inspection              | Work preserved in writable `main` clone; canonical checkout clean on `agent/fix-yelp-program-targeting`; baseline SHA matches `6456fdf`.                                                               |
| 2026-08-24 | Environment key inspection  | `ANTHROPIC_API_KEY` and `CLAUDE_REPLY_MODEL` are present; values were not printed.                                                                                                                     |
| 2026-08-24 | Official model verification | `claude-haiku-4-5`, `claude-sonnet-4-6` and `claude-opus-4-6` are current Anthropic API model IDs.                                                                                                     |
| 2026-08-24 | Migration verification      | Fresh database applied 25 migrations; existing database applied 21 legacy plus 4 release migrations. Claude, RBAC, usage and tenant data transformations passed.                                       |
| 2026-08-24 | Dependency audit            | Scoped production dependency audit returned `No known vulnerabilities found` after compatible upgrades and overrides.                                                                                  |
| 2026-08-24 | Yelp campaign inventory     | Canonical production business returned 175 CPC programs before mutation, 9 active, zero duplicate upstream program IDs.                                                                                |
| 2026-08-24 | Temporary Plumbing campaign | Yelp read-back verified upstream `5_NNKHOcfyKN3fZGBFtngA`, USD 6,900/month, Plumbing category and end date 2026-08-31; rerun planned `NOOP`.                                                           |
| 2026-08-24 | Temporary Commercial HVAC   | Yelp read-back verified upstream `qTjEw_MfGV3AN1L3vO8VyA`, USD 6,000/month, HVAC category and end date 2026-08-31; rerun planned `NOOP`.                                                               |
| 2026-08-24 | MTD semantics               | Unbounded Yelp Program List `ad_cost` is labeled billing-period spend and is not presented as MTD. True date-bounded per-program MTD remains a release blocker pending a supported Yelp data contract. |

## Release Exceptions

No exception is approved. A blocked live Yelp credential gate keeps the verdict at Not Ready or Controlled Pilot Only regardless of local test results.
