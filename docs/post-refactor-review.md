# Post-Refactor Review

This review packet is based on the current repo state after the MVP tightening pass. It is intentionally critical. The goal is to verify whether the refactor actually improved operator clarity and product trust, not to restate implementation work.

## 1. Final MVP User Journey

### 1. Dashboard
Start at `/dashboard`.

The operator should immediately see whether the tenant is actually usable:
- credential and capability readiness
- failed Yelp jobs
- business readiness blockers
- pending reporting work
- direct next actions into Businesses, Programs, Reporting, Settings, or Audit

This page now acts as an operator homepage instead of a generic overview.

### 2. Businesses
Move to `/businesses`.

The operator can:
- search for existing businesses already saved in the console
- search Yelp partner matches when Business Match is enabled
- manually save a business with an encrypted Yelp business ID
- scan which saved businesses are launch-ready versus blocked

From there, the operator should open `/businesses/<businessId>` to confirm the business record, check readiness, compare live Yelp inventory with local records, and launch a program.

### 3. Programs
Move to `/programs` or `/programs/new`.

The operator can:
- see the current program inventory
- tell which programs are active, which are waiting on Yelp, and which need review
- create a new program
- open `/programs/<programId>` to inspect local state, recent Yelp jobs, budget operations, feature access, and termination flow

The critical improvement is that this now reads as the center of the product instead of one section among many.

### 4. Reporting
Move to `/reporting`.

The operator can:
- request a delayed Yelp batch report
- review saved report runs
- open `/reporting/<reportId>` to inspect batch metadata, freshness, trends, table output, and CSV export

The page now positions reporting as a saved batch snapshot workflow rather than implied real-time performance monitoring.

### 5. Settings
Move to `/settings`.

The admin can:
- manage encrypted Yelp credentials
- toggle capabilities
- review what is truly wired into the MVP
- review what is documented but not wired yet
- manage user roles

This page is now more trustworthy because it distinguishes current operational settings from future or foundation inputs.

### 6. Audit
Move to `/audit`.

The operator or admin can:
- review recent business, program, and report actions
- see who acted and what target was affected
- review sync runs as a secondary diagnostic log

This page now behaves more like an operational follow-up surface and less like a generic admin table dump.

## 2. Section-by-Section Reality Check

### Dashboard

What the operator can actually do now:
- assess tenant readiness for the core MVP
- jump into the next intended action
- see failed Yelp jobs and business readiness blockers
- see whether reporting work is still waiting on Yelp

What is intentionally out of scope:
- no lead operations workflow
- no per-location or per-service workflow
- no CRM enrichment workflow
- no deep integration management workflow from this page

What data is real vs local-only vs future/planned:
- Real: saved credentials, saved capability flags, saved businesses, saved programs, saved report requests, saved program jobs
- Local-only: dashboard rollups and readiness summaries derived from stored console state
- Future/planned: richer health or sync orchestration across leads, CRM, and downstream operational data

Where async Yelp behavior is surfaced honestly:
- failed jobs are called out explicitly
- programs waiting on Yelp are counted separately
- reports waiting on Yelp are counted separately
- demo mode is disclosed when enabled

### Businesses

What the operator can actually do now:
- search local businesses
- use Business Match when enabled
- manually save a business
- review launch readiness
- open a business detail page to move into program creation or reporting

What is intentionally out of scope:
- no location ownership workflow
- no service classification workflow
- no lead or CRM enrichment workflow
- no broad onboarding wizard

What data is real vs local-only vs future/planned:
- Real: saved business records, encrypted Yelp business IDs, categories, current local programs, recent reports, audit events
- Real when enabled: live Yelp program inventory fetched from Yelp Ads
- Local-only: readiness scoring, manual notes implied by saved state, launch recommendations
- Future/planned: business-access allowlists, subscription coverage UX, deeper business enrichment

Where async Yelp behavior is surfaced honestly:
- live Yelp inventory is separated from local console records
- sync from Yelp is an explicit action
- no attempt is made to imply the local program list is the same thing as current upstream state

### Programs

What the operator can actually do now:
- create a new Yelp program request
- edit an existing program
- run CPC budget operations
- submit a terminate request
- inspect recent Yelp jobs
- see the local record, upstream program ID, audit trail, and current configuration

What is intentionally out of scope:
- no bulk operations
- no deep campaign optimization tooling
- no conversion import or CRM-augmented performance views
- no rich lifecycle orchestration beyond the current program/job model

What data is real vs local-only vs future/planned:
- Real: local program records, stored job history, confirmed upstream program IDs, synced status when available
- Local-only: operator notes, local queue state, drafted configuration, terminate reason and end-date notes
- Future/planned: broader feature orchestration and richer operational overlays

Where async Yelp behavior is surfaced honestly:
- the create/edit flows explicitly say the local record is saved before Yelp finishes processing
- the list page shows latest Yelp job state and missing upstream program IDs
- the detail page has a source-boundary card
- the terminate dialog explicitly says the notes are audit-only and not sent upstream

### Reporting

What the operator can actually do now:
- request daily or monthly Yelp batch reports
- review request status
- inspect saved snapshot freshness
- open report detail and export CSV

What is intentionally out of scope:
- no live attribution
- no internal conversions reporting
- no per-location or per-service reporting workflow exposed in the MVP
- no PDF export flow

What data is real vs local-only vs future/planned:
- Real: saved report requests, saved report results, fetched Yelp payload snapshots, CSV export from stored results
- Local-only: combined payload presentation and chart/table rendering
- Future/planned: CRM-enriched reporting, per-location and per-service rollups, richer export options

Where async Yelp behavior is surfaced honestly:
- reporting is labeled as batch-oriented and not real-time
- freshness uses the stored `fetchedAt` timestamp
- “waiting on Yelp” is explicit on the list page
- the report detail page frames the result as a snapshot, not a live view

### Settings

What the operator can actually do now:
- save encrypted credentials
- group capability flags by MVP versus foundation/future
- see what is wired into the MVP
- review what is not wired yet
- manage user roles

What is intentionally out of scope:
- no full Yelp OAuth/business-access flow
- no complete allowlist management UX
- no subscription coverage workflow
- no automated credential provenance tracking

What data is real vs local-only vs future/planned:
- Real: encrypted credentials, capability flags, role assignments, connection test outcomes
- Local-only: explanatory grouping and current admin UX framing
- Future/planned: wired OAuth client flows and allowlist enforcement

Where async Yelp behavior is surfaced honestly:
- not a major async page, but connection testing is framed as optional
- not-wired-yet values are explicitly called out rather than implied to be active

### Audit

What the operator can actually do now:
- review recent audit events
- see actor, action, target, and status
- review recent sync runs as secondary diagnostics

What is intentionally out of scope:
- no replay or retry tooling from this page
- no drill-in into raw payload diffs from the index
- no advanced filtering UX yet

What data is real vs local-only vs future/planned:
- Real: persisted audit events and sync runs
- Local-only: target summarization for display
- Future/planned: richer sync diagnostics, replay, and operator remediation tooling

Where async Yelp behavior is surfaced honestly:
- sync runs are shown separately from user-facing audit activity
- partial and failed background runs remain visible instead of being hidden behind success-biased summaries

## 3. File-by-File Summary of Important Changes

### Documentation and scope
- `docs/mvp-refactor-audit.md`
  - Captures the repo audit and identifies where the app was over-scoped or misleading.
- `docs/mvp-scope.md`
  - Defines the actual MVP boundary and gives the refactor a clear product target.

### Navigation and scope control
- `components/layout/app-sidebar.tsx`
  - Most important navigation change. Reduces primary nav to the true MVP and pushes unfinished domains into a separate beta/foundation section.
- `app/(console)/ads/page.tsx`
  - Resolves “Ads” versus “Programs” ambiguity by redirecting the legacy ads entrypoint into the real core workflow.

### Dashboard
- `app/(console)/dashboard/page.tsx`
  - Repositions the dashboard as an operational homepage with blockers, next actions, credential readiness, and reporting queue visibility.

### Businesses
- `app/(console)/businesses/page.tsx`
  - Turns the list page into a staging and readiness screen instead of a simple directory.
- `components/forms/business-search-form.tsx`
  - Tightens the search/save flow and reduces ambiguous onboarding copy.
- `components/forms/manual-business-form.tsx`
  - Reframes manual entry as a fallback, not a peer workflow to normal onboarding.
- `app/(console)/businesses/[businessId]/page.tsx`
  - Makes the business detail page the real handoff into program creation, live inventory review, and reporting.

### Programs
- `app/(console)/programs/page.tsx`
  - Makes programs feel like the product center with clearer in-flight versus settled state.
- `app/(console)/programs/new/page.tsx`
  - Supports preselected business flow from business detail.
- `app/(console)/programs/[programId]/page.tsx`
  - Adds stronger source boundaries and better async Yelp honesty.
- `components/forms/program-form.tsx`
  - Clarifies that local save and upstream confirmation are different; also fixes the previous over-restriction around omitted `ad_categories`.
- `components/forms/program-terminate-form.tsx`
  - Most important honesty fix in the flow. It now clearly states the end-date and reason fields are audit-only and not sent upstream.

### Reporting
- `app/(console)/reporting/page.tsx`
  - Reframes reporting as delayed Yelp batch data with freshness and queue visibility.
- `components/forms/report-request-form.tsx`
  - Tightens the request flow wording so operators do not confuse it with live reporting.
- `app/(console)/reporting/[reportId]/page.tsx`
  - Adds batch metadata and freshness framing that materially improve trust.
- `components/forms/report-status-poller.tsx`
  - Small but important honesty fix: polling is explicitly about delayed batch completion.

### Settings
- `app/(console)/settings/page.tsx`
  - Separates live MVP settings from future or foundation-only values.
- `components/forms/settings-capabilities-form.tsx`
  - Groups toggles into MVP versus foundation/future sections so the page stops implying every capability is equally production-ready.

### Audit and diagnostics
- `app/(console)/audit/page.tsx`
  - Makes audit the primary review surface and sync logs secondary.
- `lib/db/audit-repository.ts`
  - Includes `reportRequest` in audit list queries so the target column can be more informative.

### De-emphasized foundation screens
- `app/(console)/leads/page.tsx`
  - Now clearly labeled beta/foundation-only rather than reading like a nearly-finished module.
- `app/(console)/integrations/page.tsx`
  - Reframed as a diagnostic foundation screen rather than a first-class operator workspace.
- `app/(console)/locations/page.tsx`
  - Reduced to honest inventory status for future location mapping work.
- `app/(console)/services/page.tsx`
  - Reduced to honest inventory status for future service-mapping work.

## 4. Remaining Rough Edges

### UX rough edges
- The dashboard is materially better, but it still relies on many cards. It is more focused than before, not yet especially elegant.
- Businesses still puts search and manual entry on the same page. That is workable, but it is visually dense and slightly onboarding-heavy.
- The business detail page now has a stronger CTA path, but it still mixes profile, readiness, live inventory, local records, reporting, and audit in one long scroll.
- Programs list is improved, but still lacks filtering or grouping by status. On a real tenant with volume, it may become noisy quickly.
- Reporting detail still leans on generic chart and table presentation. It is more honest now, but not especially polished.
- Settings is trustworthy, but still very technical. That is acceptable for admin UX, but it is not especially lightweight.

### Copy rough edges
- Some action labels remain raw or technical, especially audit action types and job types.
- The app still uses quite a bit of “tenant”, “capability”, and “environment” language. That is probably correct internally, but still reads platform-ish in places.
- Reporting still uses raw metric names from the payload in table and chart contexts, which can feel implementation-driven rather than operator-friendly.

### Implementation shortcuts
- `/ads` still exists as a redirect rather than being fully retired.
- Program features remain reachable from program detail, which slightly re-expands surface area beyond the defined MVP.
- The audit target summary is good enough for now, but it is still a simple derived label, not a fully designed event presentation layer.
- Foundation-only pages still render real data tables and counts. They are more honest now, but they are not fully hidden.

### Things that still feel scaffolded
- The foundation-only pages still feel like generated inventory screens, just more clearly labeled.
- The audit page is functionally better but still table-first and utilitarian.
- Some list/detail pages still use repeated `Card` patterns with limited visual variation.
- The settings page still includes raw env-var names directly in user-facing copy.

### Things that may confuse an operator
- “Create program” is always present on business detail, even when the business is not ready. The next screen enforces readiness, but the CTA is still optimistic.
- Program status on the local record can still feel authoritative even when the latest Yelp job is still pending. The UI is more honest now, but operators can still misread it if they skim.
- The existence of `/program-features/[programId]` may imply a broader product scope than the MVP definition suggests.
- Foundation pages are no longer primary, but a curious operator can still discover them and assume partial support.

## 5. Top 10 Screenshots to Manually Review

### 1. `/dashboard`
- Visually inspect:
  - primary hierarchy
  - next-action buttons
  - readiness versus failed-job emphasis
  - whether the page reads like an operator homepage
- Expected result:
  - the first screen should immediately explain where to act next and what is blocking action

### 2. `/businesses`
- Visually inspect:
  - businesses as a staging workflow, not just a directory
  - flow card, search form, manual fallback, saved table ordering
  - readiness and next-action scanability
- Expected result:
  - the page should clearly imply search or save first, then launch from a saved business

### 3. `/businesses/<saved-business-id>`
- Visually inspect:
  - CTA placement
  - separation of live Yelp inventory versus local records
  - readability of readiness block
- Expected result:
  - the page should feel like the handoff into actual program operations

### 4. `/programs`
- Visually inspect:
  - whether this feels like the center of the product
  - status visibility
  - latest Yelp job clarity
  - whether “Open” and “Budget ops” are easy to spot
- Expected result:
  - operators should immediately understand which programs are settled, in-flight, or risky

### 5. `/programs/new?businessId=<saved-business-id>`
- Visually inspect:
  - business preselection
  - field hierarchy
  - ad category explanation
  - preview block clarity
- Expected result:
  - the form should feel like a controlled submission surface, not a generic CRUD form

### 6. `/programs/<saved-program-id>`
- Visually inspect:
  - summary card clarity
  - source-boundary card
  - recent Yelp jobs block
  - placement of budget ops, edit, terminate, and audit
- Expected result:
  - the page should clearly separate local record, upstream confirmation, and audit-only data

### 7. `/reporting`
- Visually inspect:
  - batch-only messaging
  - freshness summary
  - request form readability
  - saved run list usefulness
- Expected result:
  - nobody should mistake this page for live reporting

### 8. `/reporting/<saved-report-id>`
- Visually inspect:
  - batch metadata and freshness placement
  - clarity of “snapshot” framing
  - CSV export discoverability
  - whether the chart/table still feel too generic
- Expected result:
  - the page should read as a delayed Yelp snapshot with usable export, not as a dashboard panel

### 9. `/settings`
- Visually inspect:
  - distinction between MVP-wired settings and future values
  - capability section grouping
  - trustworthiness of credential cards
- Expected result:
  - the page should feel admin-grade and explicit about what is not yet wired

### 10. `/audit`
- Visually inspect:
  - usefulness of the target column
  - readability of event table
  - whether sync runs feel secondary
- Expected result:
  - the page should help answer “what happened?” faster than the old version

## 6. Top 10 Interaction Tests

### 1. Primary nav focus test
- User actions:
  - open any console page
  - inspect the left sidebar
- Expected result:
  - primary nav includes only Dashboard, Businesses, Programs, Reporting, Settings, Audit
  - Leads, Integrations, Locations, and Services appear only under a separate beta/foundation section
- Weak indicator:
  - unfinished domains still feel like equal first-class modules

### 2. Legacy ads redirect test
- User actions:
  - navigate directly to `/ads`
- Expected result:
  - redirect lands on `/programs`
  - no duplicate “Ads” workspace remains
- Weak indicator:
  - `/ads` still looks like an alternative core workflow

### 3. Business search clarity test
- User actions:
  - go to `/businesses`
  - search for a known local business
  - inspect both local and remote panels
- Expected result:
  - local matches are easy to distinguish from Yelp partner matches
  - fallback behavior is explained if Business Match is unavailable
- Weak indicator:
  - operator cannot tell whether the result came from the local console or Yelp

### 4. Manual business entry fallback test
- User actions:
  - on `/businesses`, use manual entry with a valid encrypted business ID and categories
- Expected result:
  - save succeeds
  - user lands on the new business detail page
  - the workflow feels like a fallback, not the primary path
- Weak indicator:
  - manual entry feels equivalent to the main onboarding flow

### 5. Business-to-program handoff test
- User actions:
  - open `/businesses/<saved-business-id>`
  - click `Create program`
- Expected result:
  - navigate to `/programs/new?businessId=<saved-business-id>`
  - the business is preselected in the form
- Weak indicator:
  - the handoff loses context or requires reselecting the business

### 6. Program form honesty test
- User actions:
  - on `/programs/new?businessId=<saved-business-id>`, use a ready business with no alias-backed categories selected
  - inspect the button state and preview
- Expected result:
  - submit is still allowed if readiness is otherwise valid
  - preview clearly states that `ad_categories` will be omitted
- Weak indicator:
  - the form still blocks valid CPC submission or implies alias selection is always mandatory

### 7. Program detail async honesty test
- User actions:
  - open `/programs/<saved-program-id>`
  - compare local status, upstream program ID, recent Yelp jobs, and source-boundary messaging
- Expected result:
  - a skim-reader can still tell what is settled versus what is merely queued or saved locally
- Weak indicator:
  - the page still reads as if local state equals confirmed Yelp state

### 8. Termination note boundary test
- User actions:
  - from `/programs/<saved-program-id>`, open the terminate dialog
- Expected result:
  - dialog explicitly says end-date and reason are internal audit notes only
  - CTA wording reflects sending a terminate request upstream
- Weak indicator:
  - the form still implies those note fields are part of the Yelp payload

### 9. Reporting batch framing test
- User actions:
  - open `/reporting`
  - request a report
  - open `/reporting/<saved-report-id>`
- Expected result:
  - list and detail both reinforce delayed Yelp batch behavior
  - freshness is visible
  - export is obvious
- Weak indicator:
  - an operator could mistake the report for live or same-day-final performance data

### 10. Foundation-screen downgrade test
- User actions:
  - open `/leads` and `/integrations`
- Expected result:
  - both pages are clearly beta/foundation-only
  - both read as diagnostic or future-facing, not like nearly-finished production modules
- Weak indicator:
  - the operator would believe leads or integrations are already supported end to end

## Bottom Line

The refactor is directionally strong. The app now reads like a focused internal Yelp Ads operations MVP instead of a broad platform skeleton.

The strongest improvements are:
- navigation focus
- better operator flow from businesses into programs
- stronger async honesty in programs and reporting
- more trustworthy settings framing

The biggest remaining risks are:
- some pages still feel card-heavy and scaffold-derived
- the product still exposes a few adjacent surfaces that slightly blur the MVP boundary
- copy remains somewhat technical in places

If the screenshots and interaction tests above pass cleanly, the refactor is credible. If they do not, the weak points will likely be in polish and operator comprehension, not in raw breadth anymore.
