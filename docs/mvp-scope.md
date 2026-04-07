# MVP Scope

## Product Positioning

This product is an internal Yelp Ads operations console.

It is not yet a full Yelp operations platform.

The MVP exists to help internal operators:

1. get a business into the console
2. understand whether it is ready for CPC launch
3. create and manage Yelp programs
4. request and review Yelp batch reports
5. manage credentials and capabilities safely
6. audit what changed

## In MVP

Primary navigation:

- Dashboard
- Businesses
- Programs
- Reporting
- Settings
- Audit

Primary workflows:

1. Dashboard to identify blockers or next steps
2. Businesses search or manual save
3. Business detail to confirm CPC readiness
4. Program creation and program edits
5. Budget operations and termination
6. Reporting request, polling, review, and export
7. Admin credential and capability management
8. Audit review

## Out of MVP

These are not primary MVP surfaces:

- leads operations
- CRM enrichment operations
- per-location reporting control surfaces
- per-service reporting control surfaces
- integration retry tooling
- OAuth/business-access management UI
- subscription coverage management UI

These concepts may exist in schema or docs, but they should not read as completed product areas.

## Hidden or Beta / Foundation

Routes may remain available for internal development, but they should be visually secondary and not first-class in the main operator journey:

- Leads
- Integrations
- Locations
- Services

Program Features is also secondary. It remains useful, but it should be discoverable from Programs rather than competing as a top-level product area.

## Primary User Journey

### 1. Dashboard

The operator lands on a page that answers:

- Are credentials healthy?
- Are any jobs failing?
- Which businesses are blocked from launch?
- What should I do next?

### 2. Businesses

The operator searches or manually saves a business, then checks:

- category quality
- readiness blockers
- ad eligibility
- whether the account is ready for program launch

### 3. Programs

The operator creates or updates a Yelp program, then tracks the async Yelp job until it completes or fails.

### 4. Reporting

The operator requests a Yelp batch report, waits for completion, reviews the output, and exports CSV.

### 5. Settings

An admin configures credentials, capability flags, and roles with clear wired-vs-future boundaries.

### 6. Audit

The operator or admin reviews recent business, program, report, and settings activity.

## Visual Communication Rules

### Yelp-native

Use this for:

- business IDs
- ad program lifecycle on Yelp
- async Yelp job status
- batch reporting data

UI treatment:

- normal product copy
- explicit mention of Yelp where useful
- badges or helper text only when needed for clarity

### Internal / Local

Use this for:

- operator notes
- local readiness checks
- local capability flags
- audit-only metadata
- local program state while waiting for Yelp confirmation

UI treatment:

- label as `Internal` or `Local` when ambiguity exists
- never imply it is confirmed by Yelp unless it is

### Planned / Future

Use this for:

- leads ingestion workflows not yet wired
- OAuth/business access management
- allowlist or subscription coverage management
- retry tooling not yet implemented

UI treatment:

- keep out of primary navigation
- if visible, label as `Foundation only` or `Not wired yet`
- do not use product-finished language

### Demo Mode

Use this only where the app already supports local demo behavior.

UI treatment:

- clearly state when a result is local demo behavior
- never present demo results as live Yelp confirmation

## Product Decisions

### Ads vs Programs

Use `Programs` as the primary product area.

Reason:

- it is the concrete operator workflow
- it already exists and is the real center of the app
- a separate `Ads` landing page currently adds ambiguity rather than value

### Program Features

Keep available, but treat as an advanced per-program action rather than a primary navigation item.

### Reporting

Keep reporting in MVP, but always communicate:

- batch-generated
- delayed
- not real-time

### Settings

Keep future-facing notes only where needed to avoid operator confusion. Settings should primarily explain what is wired now.
