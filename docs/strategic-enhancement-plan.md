# Strategic Enhancement Plan

## Purpose

This plan defines the next production-grade enhancement path for the Yelp Ads operations console.

The goal is not to widen product scope. The goal is to make the existing system stronger in four areas:

1. Yelp connection reliability
2. AI conversation quality and safety
3. Business and program control
4. Clear, intuitive operator UX

The current product is controlled-pilot ready. The next work should move it from pilot-ready toward broader production confidence.

## Product Principles

- Yelp remains the source boundary for lead/thread data.
- Yelp thread remains the primary reply channel.
- AI should assist and automate only inside bounded, auditable rules.
- Operators must always understand what happened, why it happened, and what to do next.
- Business-level control should be explicit. Automation should not silently apply to all businesses.
- Program controls should explain operational state without forcing users to understand backend architecture.
- UI should feel like a calm operator console, not a generated admin panel.

## Non-Goals

- Do not build an unrestricted chatbot.
- Do not add customer-facing surfaces.
- Do not redesign the entire app.
- Do not create a new incident platform.
- Do not add speculative business modules.
- Do not hide operational risk behind optimistic UI.

## Readiness Target

Current estimated readiness:

- Controlled pilot: 90%+
- Small production rollout: 80%+
- Broader production rollout: low 70s

Target after this roadmap:

- Controlled pilot: 95%+
- Small production rollout: 90%+
- Broader production rollout: 82% to 88%, depending on whether durable queue and external observability are added

## Priority Model

### P0: Must Fix Before Broader Rollout

- Strong webhook and reconcile observability
- Clear Yelp connection health per business
- Better AI conversation audit trail and review visibility
- DB-driven high-volume filters
- Report aggregation cost control
- External alerting for critical failure modes
- Explicit business enablement model for autoresponder and conversations

### P1: Strongly Recommended Before More Businesses

- Durable worker queue or stronger job leases/dead-letter behavior
- Business/program control center improvements
- Better lead detail conversation timeline
- Better operator review workflow for AI replies
- Real load checks on production-like data

### P2: Product Polish After Core Risk Is Lower

- Further copy reduction
- Smaller empty states in deep modules
- More consistent form patterns
- Better analytics summaries for operators
- Additional UX refinements for integrations and reporting

## Phase 1: Yelp Connection Reliability

### Current Concern

Yelp webhook intake and forwarding now work, but operators still need stronger proof that each business is actually connected, receiving events, reconciling leads, and able to send thread replies.

### Enhancements

- Add a per-business Yelp connection health model that combines:
  - business allowlist status
  - last webhook received
  - last webhook reconciled
  - last successful lead fetch
  - last successful Yelp thread send
  - last Yelp API error
  - token/config readiness
- Add a compact connection status surface on:
  - Autoresponder business delivery status
  - Business detail
  - Lead detail when a lead is blocked by Yelp access
- Add a synthetic Yelp readiness check that validates:
  - the business is known locally
  - the external Yelp business ID is configured
  - the app has a usable access token or configured delivery path
  - the platform webhook endpoint accepts forwarded events
- Add clearer error mapping for Yelp failures:
  - invalid business ID
  - unauthorized token
  - rate limited
  - missing/expired token
  - unavailable lead/thread
  - send rejected

### Acceptance Criteria

- Operator can answer: "Is this Yelp business actually connected?"
- Operator can answer: "When did we last receive and process a Yelp event?"
- Operator can answer: "Can we send into this Yelp thread?"
- Failed Yelp calls create useful issue context instead of generic errors.

## Phase 2: Webhook, Reconcile, and Backfill Confidence

### Current Concern

Webhook-first processing is correct, but production confidence depends on proving backlog, lag, retries, and idempotency under real load.

### Enhancements

- Add visible webhook/reconcile backlog metrics:
  - accepted webhook events
  - pending events
  - processing events
  - failed events
  - oldest pending age
  - reconcile success/failure count
- Add a webhook event drilldown surface in Audit or Operations:
  - event key
  - business
  - lead ID
  - status
  - error summary
  - created/processed timestamps
- Keep backfill capped by default, but make the cap explicit in UI:
  - "Last 300 leads"
  - progress count
  - pages fetched
  - imported/updated/failed
- Add a stronger production-like verification command:
  - fresh DB migrate
  - seed
  - webhook POST
  - reconcile
  - lead appears
  - autoresponder eligibility checked

### Acceptance Criteria

- A webhook burst does not create duplicate leads.
- A stuck reconcile job is visible and recoverable.
- Backfill progress is understandable and bounded.
- Production deploy checklist includes a real end-to-end webhook verification.

## Phase 3: AI Conversation Strengthening

### Current Concern

AI conversation automation exists, but it needs stronger operator trust. The operator should see what AI used, what it decided, and why it did or did not send.

### Enhancements

- Improve AI decision records with:
  - inbound customer message excerpt
  - classification result
  - confidence
  - selected template family
  - selected rule
  - AI prompt/guidance source
  - model used
  - generated reply
  - final sent reply
  - stop reason if blocked
  - human override/edit status
- Add an AI conversation panel on lead detail:
  - current mode
  - last AI decision
  - whether auto-send is allowed
  - why automation stopped
  - suggested next action
- Make review mode more useful:
  - show draft reply clearly
  - show why it is review-only
  - allow operator to send/edit from the lead workflow
  - record whether the operator edited before sending
- Tighten AI guardrails:
  - no invented pricing
  - no arrival guarantees
  - no unsupported service coverage claims
  - no discounts or promises unless explicitly configured
  - auto-stop on low confidence, complaint, pricing, unclear availability, or max turns
- Add tests around prompt/template/rule routing:
  - template family selected correctly
  - business override beats tenant default
  - risky intent blocks auto-send
  - AI fallback uses safe static copy

### Acceptance Criteria

- Operator can answer: "What did AI do on this lead?"
- Operator can answer: "Why did AI send or not send?"
- Auto-sent replies are visibly based on configured templates/rules.
- Review-only drafts are actually actionable, not hidden debug artifacts.
- Risky conversations stop reliably.

## Phase 4: Autoresponder Business Scope and Control

### Current Concern

Automation should be enabled only for chosen businesses. Tenant defaults are useful, but the UI and data model must avoid implying all businesses are live by default.

### Enhancements

- Make business-scoped enablement the primary mental model:
  - business disabled
  - initial reply enabled
  - follow-ups enabled
  - conversation review-only
  - bounded conversation auto-reply
  - paused
- Add a business automation matrix:
  - Yelp business
  - initial reply
  - follow-ups
  - conversation mode
  - AI assist
  - last send
  - open issues
  - health status
- Keep tenant defaults but label them as fallback defaults, not the main enablement mechanism.
- Add quick pause controls:
  - pause one business
  - pause all conversation automation
  - pause all autoresponder sends
- Make inactive dependent settings hidden or visually demoted.

### Acceptance Criteria

- Operator can choose exactly which businesses have autoresponder enabled.
- New businesses are conservative by default.
- Business-level pause is obvious.
- Tenant defaults no longer feel like accidental global activation.

## Phase 5: Business and Program Control

### Current Concern

Businesses, programs, services, locations, and external connector mappings exist, but control can still feel distributed across too many pages.

### Enhancements

- Add a clearer business detail operational summary:
  - Yelp connection
  - autoresponder status
  - conversation mode
  - active programs
  - ServiceTitan mapping
  - report recipients
  - open issues
- Improve program detail clarity:
  - program status
  - budget state
  - active features
  - associated business/location
  - sync status
  - last downstream lifecycle update
- Add consistency between business, program, lead, and integrations terminology:
  - use "business" for Yelp business control
  - use "program" for Yelp Ads program control
  - use "location" only when referring to routing/reporting/ServiceTitan mapping
- Add operational warnings where control is incomplete:
  - business has leads but no autoresponder setting
  - business has automation enabled but no valid Yelp connection
  - program exists but business mapping is missing
  - ServiceTitan mapping missing for synced business

### Acceptance Criteria

- Operator can understand one business's operational posture from one page.
- Program state does not require reading multiple pages.
- Missing mappings are visible before they break downstream workflows.

## Phase 6: Lead Detail as the Core Workbench

### Current Concern

Lead detail is the place where operators decide whether automation is trustworthy. It must be the clearest page in the product.

### Enhancements

- Make the lead detail hierarchy:
  1. customer/request context
  2. Yelp thread/reply action
  3. AI/autoresponder status
  4. business/program/mapping context
  5. audit and technical history
- Add a compact conversation timeline:
  - customer inbound
  - automated reply
  - AI draft
  - human reply
  - blocked/handoff event
  - follow-up scheduled/sent
- Make AI summaries visibly distinct from system-of-record data.
- Keep technical payload/audit content collapsed.
- Make "what to do next" obvious:
  - reply now
  - review AI draft
  - resolve issue
  - map lead
  - wait for customer

### Acceptance Criteria

- A new operator can understand a lead in under 30 seconds.
- AI and automation actions are clear without debug reading.
- Reply action is always easy to find.
- Technical history stays available but secondary.

## Phase 7: Operator UX Consistency

### Current Concern

The app has improved, but broad consistency still matters as more operators use it daily.

### Enhancements

- Standardize page headers:
  - title
  - one-line operational context
  - primary action
  - compact status badges only when useful
- Standardize list pages:
  - filter strip
  - count summary
  - main list/table
  - compact empty state
- Standardize editor patterns:
  - list left, editor right only when each side has enough width
  - otherwise stack list then editor
  - save action at the end
  - delete/disable secondary
- Standardize status language:
  - Ready
  - Needs setup
  - Paused
  - Blocked
  - Review needed
  - Failed
- Remove remaining architecture copy:
  - internal model names
  - unnecessary policy repetition
  - long helper paragraphs

### Acceptance Criteria

- Leads, Lead detail, Autoresponder, Audit, Reporting, Integrations, Businesses, and Programs feel like one product.
- Operators do not need to relearn controls on each page.
- Empty states are small, useful, and action-oriented.

## Phase 8: API and Worker Hardening

### Current Concern

Current leases/retries are pilot-capable. Broader rollout needs stronger durability and clearer side-effect control.

### Enhancements

- Add strict idempotency for external side effects:
  - Yelp thread send
  - SMTP send
  - ServiceTitan sync
  - report delivery
  - AI-generated automation decision
- Add dead-letter style visibility for work that repeatedly fails.
- Add retry budgets by provider:
  - Yelp
  - ServiceTitan
  - OpenAI
  - SMTP
- Add per-tenant/business rate guardrails.
- Prevent duplicate sends under overlapping worker runs.
- Add clear admin retry actions only for safe retryable failures.
- Evaluate a real queue when volume increases:
  - Inngest
  - Trigger.dev
  - BullMQ with Redis
  - managed queue plus worker

### Acceptance Criteria

- Same webhook/job can run twice without duplicate customer-visible side effects.
- Repeated failures stop and become visible.
- Provider downtime does not create retry storms.
- Operators can retry safely when the failure is retryable.

## Phase 9: DB and Query Scale

### Current Concern

Some high-volume paths are still acceptable for pilot but not for large lead/history volume.

### Enhancements

- Move lead status filtering fully into the DB.
- Replace full-window report breakdown scans with:
  - precomputed rollups
  - incremental aggregates
  - cached report computation
  - or bounded windows with explicit limits
- Add query-plan verification for:
  - leads list
  - lead detail
  - audit issue queue
  - autoresponder review operations
  - reporting detail
  - integrations overview
- Add archive/export path before redaction if long-term audit evidence is required.
- Add growth monitoring for:
  - webhook events
  - sync runs
  - audit events
  - conversation turns
  - lead actions
  - metrics rollups

### Acceptance Criteria

- Lead list remains fast with large datasets.
- Reporting cost is bounded.
- Audit/debug tables do not grow without policy.
- Production DB query behavior is measured, not guessed.

## Phase 10: Observability and Operations

### Current Concern

In-app metrics exist, but production operations need external alerting and easier failure triage.

### Enhancements

- Add external monitoring/log sink:
  - Sentry for app errors
  - Axiom/Datadog/Logtail for logs
  - Datadog/Grafana/Prometheus-compatible metrics if needed
- Add alerts for:
  - webhook lag
  - reconcile failure rate
  - failed sends
  - pending follow-up backlog
  - open issue growth
  - report delivery failures
  - ServiceTitan sync failures
  - OpenAI failures or fallback spikes
  - retention job failures
- Add synthetic canaries:
  - webhook verification endpoint
  - main platform webhook accept
  - reconcile route
  - follow-up route
  - retention route
- Add a daily pilot operator checklist inside docs and optionally as an admin checklist view.

### Acceptance Criteria

- Team knows something is broken before a customer reports it.
- Alerts identify impacted business/provider/flow.
- Pilot operator can run daily checks in under 10 minutes.

## Phase 11: Verification and Release Discipline

### Current Concern

The repo has many moving parts and direct production pushes require strict discipline.

### Enhancements

- Add a production release checklist:
  - review diff
  - verify migrations
  - check env vars
  - run full test/build suite
  - run webhook smoke test
  - run autoresponder smoke test
  - run retention/metrics smoke test
- Add CI checks for:
  - typecheck
  - lint
  - tests
  - build
  - Prisma generate
  - migration deploy against disposable Postgres
- Add a staging verification path if possible.
- Keep secrets out of chat/logs and rotate exposed keys.

### Acceptance Criteria

- Production deploy is repeatable.
- Fresh DB path is tested.
- Bad migrations are caught before production.
- Secrets are managed as production assets.

## Recommended Execution Order

### Sprint 1: Yelp and Business Control

- Per-business Yelp health
- Autoresponder business matrix
- Explicit business enablement and pause states
- Lead detail connection/automation context

### Sprint 2: AI Conversation Trust

- Stronger AI decision artifact display
- Review-mode workflow improvements
- Prompt/template/rule traceability
- More tests for stop conditions and rule routing

### Sprint 3: DB and Worker Safety

- DB-driven lead status filtering
- Safer report breakdown aggregation
- Idempotency hardening for sends/deliveries
- Dead-letter style failed-work visibility

### Sprint 4: UX Consistency

- Page header consistency
- Business/program pages operational summary
- Reporting and integrations copy reduction
- Empty state and dense-table QA

### Sprint 5: Observability and Release Readiness

- External logging/error tracking
- Alert thresholds
- Synthetic canaries
- CI production-like migration verification

## Top 10 Enhancements To Do Next

1. Add per-business Yelp connection health.
2. Add business automation matrix on Autoresponder.
3. Improve lead detail AI/conversation decision visibility.
4. Make review-only AI drafts easy to inspect, edit, and send.
5. Move lead status filtering fully into DB.
6. Bound report breakdown cost with rollups or cached aggregation.
7. Add external error/log monitoring and alerting.
8. Add strict idempotency records for all customer-visible sends.
9. Add dead-letter/retry visibility for stuck workers.
10. Standardize business/program operational summaries.

## Blunt Product Judgment

The product direction is correct. The remaining work is not "more features." The remaining work is making the existing features easier to trust.

The strongest next product improvement is this combination:

- every business has a clear connection and automation posture
- every AI message has a visible decision trail
- every lead has an obvious next action
- every worker failure becomes visible and recoverable
- every heavy list/report path remains fast under real data

If those are done, the product will feel substantially more production-grade without becoming larger or more complicated.
