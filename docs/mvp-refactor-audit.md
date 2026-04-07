# MVP Refactor Audit

Date: 2026-04-03

## Summary

The repository already contains a credible technical foundation for an internal Yelp Ads operations console:

- Next.js App Router
- TypeScript
- Prisma + PostgreSQL
- Tailwind + Radix/shadcn-style primitives
- TanStack Query
- Vitest + Playwright

The problem is not missing architecture. The problem is product focus.

The app currently reads like a platform scaffold with many sections and a large schema, but only a subset of the operator workflows feel complete and trustworthy. Several newer sections are visible as if they are product-ready even though they are still foundation-only or explicitly not wired.

The best path is not more breadth. The best path is to tighten the app around the real operator MVP:

1. Dashboard
2. Businesses
3. Programs / Ads
4. Reporting
5. Settings
6. Audit

Everything else should be hidden from primary navigation or clearly marked as foundation-only.

## Current Route Tree

Console routes:

- `/dashboard`
- `/ads`
- `/businesses`
- `/businesses/[businessId]`
- `/programs`
- `/programs/new`
- `/programs/[programId]`
- `/program-features`
- `/program-features/[programId]`
- `/reporting`
- `/reporting/[reportId]`
- `/settings`
- `/audit`
- `/leads`
- `/integrations`
- `/locations`
- `/services`

Other app routes:

- `/login`
- `/`

API routes:

- auth: login, logout
- businesses: search, create, update, readiness patch, program sync
- programs: create, patch, terminate, budget ops, feature ops, job poll
- reporting: request, detail, export
- settings: capabilities, credentials, credential test, users
- internal reconcile endpoint

Observation:

- The route tree is much broader than the currently credible operator MVP.
- There are no `app/api` routes for leads, locations, services, or integrations. Those screens are mostly data-foundation views, not true workflows.

## Current Navigation Structure

Current primary sidebar includes:

- Dashboard
- Ads
- Leads
- Reporting
- Locations
- Services
- Integrations
- Admin Settings
- Audit / Sync Logs

Problems:

- `Ads` and `Programs` overlap conceptually. The product has both `/ads` and `/programs`, but `Programs` is still where the core action actually lives.
- `Leads`, `Locations`, `Services`, and `Integrations` are visible as first-class product areas even though they are not finished.
- `Businesses` and `Programs` are not in primary navigation, even though those are the actual core operational flows.

## Current Feature Modules

### 1. Dashboard

Implemented:

- credential health
- enabled capability chips
- quick actions
- failed jobs
- businesses with CPC readiness blockers

Assessment:

- functional, but generic
- includes non-MVP quick links to unfinished areas
- hierarchy is too flat

### 2. Businesses

Implemented:

- local search
- optional Business Match search
- manual business save
- business detail
- readiness evaluation for CPC
- live Yelp program inventory lookup on detail page

Assessment:

- strong candidate for MVP
- detail page already supports the next action toward program launch
- list page needs tighter operator framing and better readiness scanning

### 3. Programs

Implemented:

- create program
- edit program
- terminate program
- budget operations
- job polling
- audit timeline
- raw local configuration view

Assessment:

- strongest core workflow in the repo
- clearly should be the center of the product
- several honesty gaps remain in copy and workflow framing

### 4. Program Features

Implemented:

- separate index and detail flow for per-program features
- capability gating

Assessment:

- real functionality exists
- but it is secondary to the MVP and does not need its own primary route concept
- better treated as an advanced action from a program detail page

### 5. Reporting

Implemented:

- report request form
- report status polling
- saved run list
- detail page with chart, table, raw JSON, CSV export

Assessment:

- useful and real
- still too generic in presentation
- freshness and batch semantics need stronger visual treatment

### 6. Settings

Implemented:

- encrypted credential storage
- credential testing
- capability toggles
- role management
- env-var mapping notes

Assessment:

- functionally solid
- copy currently mixes real configuration with future or not-yet-wired concepts
- needs to feel more admin-grade and less exploratory

### 7. Audit

Implemented:

- recent audit event table
- recent sync-run table
- audit timelines on detail pages

Assessment:

- useful raw material
- needs better scannability and stronger linkage to business/program/report context

### 8. Leads

Implemented:

- counts
- capability/foundation messaging
- recent webhook/sync summaries

Not implemented:

- lead list
- lead detail
- lead ingestion API routes
- real operator workflow

Assessment:

- currently a foundation page
- should not appear as a finished module

### 9. Integrations

Implemented:

- integration status summaries
- recent sync run table

Not implemented:

- retry controls
- actual operational integration workflows
- subscription-coverage management

Assessment:

- mostly a foundation readout
- should not be framed as a complete operator surface

### 10. Locations / Services

Implemented:

- read-only directory summaries based on current schema

Not implemented:

- true management workflows
- reporting rollups
- lead ownership flows

Assessment:

- foundation-only
- not ready for primary navigation

## Actual Implemented Operator Flows

These are the flows that already feel real:

1. Log in
2. Search or manually save a business
3. Review CPC readiness and Yelp ad eligibility
4. Create a Yelp program
5. Poll the async Yelp job
6. Re-open the program and make budget or configuration changes
7. Request a Yelp report
8. Poll the report until ready
9. Export CSV
10. Review audit history
11. Configure credentials and capability flags

This is the real MVP today. The product should be optimized around it.

## Unfinished or Misleading Modules

### Leads

The page explicitly says the full lead list/detail surfaces have not landed yet and ingestion routes are not wired yet.

### Integrations

The page talks about retry controls and deeper diagnostics attaching later. It reads as a finished admin module but is not one.

### Locations

Reads like a future reporting and mapping center, but is currently only a schema-backed directory.

### Services

Reads like a future taxonomy or analytics control surface, but is currently only a schema-backed directory.

### Settings OAuth/business-access language

The Settings page explains `YELP_CLIENT_ID`, `YELP_CLIENT_SECRET`, `YELP_REDIRECT_URI`, and `YELP_ALLOWED_BUSINESS_IDS`, but also says those flows are not wired yet. This is honest, but the product still exposes those concepts too prominently for the current MVP.

## UX Issues

### Navigation mismatch

- Primary nav emphasizes unfinished modules.
- Core flows like Businesses and Programs are not represented clearly enough.

### Ambiguous product naming

- `Ads` and `Programs` overlap.
- `Audit / Sync Logs` suggests a larger platform than the MVP needs.

### Too much card-driven scaffolding

- Many pages lead with metric cards or generic summaries instead of the operator task.
- Some pages feel like admin dashboards rather than action-oriented internal tools.

### Placeholder-sounding copy

Examples:

- “Phase 1 makes the ownership line explicit before the full lead list and detail surfaces land.”
- “Retry controls and deeper diagnostics will attach to this same operational log pattern in later phases.”
- “Future OAuth/business-access integration layer.”

These are honest, but they read like roadmap notes inside the product.

### Weak action hierarchy

- Dashboard quick actions point to unfinished areas.
- Reporting is usable but does not surface freshness or batch limitations strongly enough.
- Businesses list does not clearly guide the operator toward the next launch action.

### Audit readability

- Audit is scannable at a raw table level, but low on context.
- Actions are not grouped or framed around the key objects an operator cares about.

## Architecture Issues

### Product breadth exceeds implemented workflows

The schema and route tree are ahead of the actual product maturity.

### Separate `Ads` wrapper page adds overlap

The new `/ads` screen mostly links to existing businesses/programs/reporting pages. It adds navigation depth without clarifying the primary flow.

### Foundation-only modules share the same UI language as finished modules

There is little visual distinction between:

- operator-ready screens
- internal foundation screens
- future capability notes

### Reporting freshness model is under-communicated

The data model understands delayed reporting, but the UI still needs stronger freshness/status language.

## Type / Schema / Product Mismatches

### Program terminate payload mismatch

`components/forms/program-terminate-form.tsx` collects `endDate` and `reason`, and the UI says they are stored internally for audit review. That is true.

But `lib/yelp/mappers.ts` currently maps terminate requests to `{}`:

- `mapTerminateProgramFormToDto(values)` returns an empty payload

This is honest only if the UI states clearly that the notes are local-only and not sent to Yelp.

### Advanced operations schema without operator workflow

The schema includes `YelpLead`, `YelpWebhookEvent`, `Location`, `ServiceCategory`, `CrmLeadMapping`, `SyncRun`, and related models, but there is no end-to-end operator journey using them yet.

This is acceptable technically, but the UI must stop presenting those modules as if they are finished.

## Dead or Low-Value Screens

### `/ads`

Low-value in current form. It mostly restates other screens and adds overlap with Programs.

### `/leads`

High-value concept, low-value current implementation. Should be hidden or clearly marked as foundation-only.

### `/integrations`

Useful internally, but not MVP-grade for the primary operator journey.

### `/locations`

Foundation-only.

### `/services`

Foundation-only.

## Quick Wins

1. Remove non-MVP sections from primary navigation.
2. Restore Businesses and Programs as top-level nav items.
3. Remove or de-emphasize the `/ads` wrapper as a separate primary concept.
4. Rewrite Dashboard around action:
   - connection health
   - jobs needing attention
   - businesses blocked from launch
   - most likely next actions
5. Tighten Businesses list and detail to make launch readiness obvious.
6. Make Programs the visual center of the product.
7. Strengthen reporting freshness and batch labeling.
8. Reframe Leads / Integrations / Locations / Services as foundation-only.
9. Reduce platform or roadmap language on user-facing pages.
10. Improve Settings copy so wired vs future is unmistakable.

## Risky Areas

### Yelp async job honesty

The product already models async jobs correctly. Copy changes must preserve that honesty and not imply synchronous confirmation.

### Program terminate semantics

Because terminate notes are local-only today, any copy changes must be precise and not imply Yelp receives those fields.

### Capability flags

Capability toggles currently mix “real current capability” and “future availability” ideas. Refactoring must not break the existing permission and credential patterns.

### Hiding unfinished modules

Routes can remain, but navigation and page framing should change. Avoid deleting foundation code that the repo may need soon unless it is clearly dead.

## Recommended MVP Refactor Direction

Center the app on:

- Dashboard
- Businesses
- Programs
- Reporting
- Settings
- Audit

Then:

- hide or de-emphasize `/leads`, `/integrations`, `/locations`, `/services`
- fold `Ads` naming into `Programs` or use it only as copy, not as a competing primary route
- treat Program Features as an advanced action inside Programs, not a primary product area

This will make the repository feel like a deliberate internal Yelp Ads operations MVP instead of a broad but thin admin shell.
