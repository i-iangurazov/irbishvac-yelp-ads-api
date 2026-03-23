# Yelp Ads Console Feature Reference

This document describes the current implementation of the internal Yelp Ads Console in this repository.

It covers:

- what each UI section does
- every operator-facing input currently shown in the UI
- the internal route or workflow each action calls
- the Yelp-facing payload shape used by the server adapters
- the expected output, side effects, and persisted changes

This is an implementation reference, not a product roadmap. It reflects the current codebase.

## Core concepts

- All Yelp requests run server-side only.
- Browser forms call internal Next.js route handlers under `app/api/*`.
- Internal handlers validate input with Zod, call feature services, persist local state with Prisma, and write audit events.
- Yelp Ads program operations are asynchronous. The initial submit returns a `job_id`, and the console polls Yelp until the job reaches a terminal state.
- Business readiness and ad eligibility are local operational states derived from saved business data and prior Yelp responses.

## Roles and permissions

Current roles:

- `ADMIN`: full access
- `OPERATOR`: businesses, programs, terminate, features, reports, audit
- `ANALYST`: read-only for businesses/programs/features plus reporting request/read and audit
- `VIEWER`: read-only access, no write actions

Current permission groups:

- `settings:read`, `settings:write`
- `businesses:read`, `businesses:write`
- `programs:read`, `programs:write`, `programs:terminate`
- `features:read`, `features:write`
- `reports:read`, `reports:request`
- `audit:read`

## Navigation summary

Current console sections:

- `Dashboard`: health, quick actions, failed jobs, readiness issues
- `Businesses`: search, save, inspect, readiness
- `Programs`: inventory, create, edit, terminate, budget ops, job polling
- `Program Features`: per-program feature configuration
- `Reporting`: request, poll, view, export
- `Admin Settings`: credentials, capability toggles, role assignments
- `Audit Log`: recent audit events

## Status glossary

Program/job statuses used in the UI:

- `QUEUED`: request accepted locally or by Yelp, waiting to process
- `PROCESSING`: Yelp is still processing the async job
- `COMPLETED`: operation finished successfully
- `PARTIAL`: mixed success/failure in upstream receipt
- `FAILED`: request or polling finished with failure
- `ACTIVE`: program live
- `SCHEDULED`: program start date is in the future
- `ENDED`: termination succeeded

Report statuses:

- `REQUESTED`
- `PROCESSING`
- `READY`
- `FAILED`

Business ad eligibility states:

- `Unknown`: Yelp has not yet confirmed ad eligibility
- `Eligible`: a Yelp ads operation completed successfully for this business
- `Blocked by Yelp policy`: Yelp rejected the business for ad policy reasons, for example `UNSUPPORTED_CATEGORIES`

## UI and workflow reference

### 1. Login

UI component: `components/forms/login-form.tsx`

Inputs:

- `Email`: internal staff account email
- `Password`: internal staff account password

Internal route:

- `POST /api/auth/login`

Internal payload:

```json
{
  "email": "admin@yelp-console.local",
  "password": "ChangeMe123!"
}
```

Output:

- success response: `{ "success": true }`
- session cookie is set server-side
- browser redirects to `/dashboard`

### 2. Dashboard

Page: `app/(console)/dashboard/page.tsx`

Outputs shown:

- saved credential health and capability status
- quick actions
- failed or partial program jobs
- businesses with CPC readiness issues
- ad eligibility badges for businesses shown in the readiness section

No direct form inputs exist on this page.

### 3. Businesses

#### 3.1 Business search

UI component: `components/forms/business-search-form.tsx`

Inputs:

- `Business name`: search string for local businesses and optional Business Match lookup
- `Location`: optional location hint sent to Business Match

Internal route:

- `POST /api/businesses/search`

Internal payload:

```json
{
  "query": "Northwind HVAC",
  "location": "San Francisco, CA"
}
```

Output:

- `local`: saved businesses matching the query
- `remote`: Business Match candidates if that capability and credential are enabled
- `remoteState.message`: explicit explanation if Business Match is disabled or unavailable

Side effects:

- none until the operator clicks `Save to console`

#### 3.2 Save matched business

Triggered from Business Match search results.

Internal route:

- `POST /api/businesses`

Internal payload:

```json
{
  "source": "match",
  "encrypted_business_id": "enc_business_123",
  "name": "Northwind HVAC",
  "city": "San Francisco",
  "state": "CA",
  "country": "US",
  "categories": [
    { "label": "Plumbing", "alias": "plumbing" }
  ]
}
```

Output:

- saved business record

Side effects:

- upserts local `Business`
- stores normalized categories JSON
- preserves existing readiness and eligibility state when re-saving the same business
- writes audit event `business.match.save`

#### 3.3 Manual business entry

UI component: `components/forms/manual-business-form.tsx`

Inputs:

- `Business name`: operator-facing business label
- `Encrypted Yelp business ID`: required upstream business identifier used for ads and reporting
- `City`
- `State / region`
- `Country`
- `Categories`: one per line, format `Label | yelp_alias`
- `About-this-business text already exists`: readiness hint for CPC

What the categories input is for:

- display labels make the business understandable to staff
- Yelp category aliases can be used for explicit CPC `ad_categories`
- if aliases are missing, CPC create/edit can still be submitted without `ad_categories`, allowing Yelp to infer categories from the business listing

Internal route:

- `POST /api/businesses`

Internal payload example:

```json
{
  "source": "manual",
  "encrypted_business_id": "enc_business_123",
  "name": "Northwind HVAC",
  "city": "San Francisco",
  "state": "CA",
  "country": "US",
  "categories": [
    { "label": "Plumbing", "alias": "plumbing" },
    { "label": "Movers", "alias": "movers" }
  ],
  "readiness": {
    "hasAboutText": true,
    "hasCategories": true,
    "missingItems": []
  }
}
```

Output:

- saved business record
- redirect to `/businesses/[businessId]`

Side effects:

- upserts local `Business`
- computes readiness preview
- writes audit event `business.manual.save`

#### 3.4 Business detail

Page: `app/(console)/businesses/[businessId]/page.tsx`

Outputs shown:

- encrypted Yelp business ID
- location
- normalized category labels and aliases
- warning if saved categories are missing aliases
- `Ad eligibility` badge: `Unknown`, `Eligible`, or `Blocked by Yelp policy`
- readiness panel with missing items
- linked program inventory
- recent report requests
- audit timeline

Current readiness rules:

- specialties/about-this-business text present
- at least one category present
- no persisted ad-policy block from Yelp

### 4. Programs

#### 4.1 Program inventory

Page: `app/(console)/programs/page.tsx`

Outputs shown:

- business name
- program type
- status
- budget
- links to program detail and CPC budget operations

No direct inputs on this page besides navigation actions.

#### 4.2 Create program

UI component: `components/forms/program-form.tsx`

Used on:

- `app/(console)/programs/new/page.tsx`

Inputs:

- `Business`: local business record to use
- `Program type`: one of `BP`, `EP`, `CPC`, `RCA`, `CTA`, `SLIDESHOW`, `BH`, `VL`, `LOGO`, `PORTFOLIO`
- `Start date`
- `Currency`
- `Monthly budget (dollars)`: human-friendly currency input, converted to cents server-side
- `Ad categories`: optional alias-backed checkboxes loaded from the selected business
- `Use Yelp autobid`
- `Max bid (dollars)`: enabled only when autobid is off
- `Pacing method`: `paced` or `unpaced`
- `Fee period`: `CALENDAR_MONTH` or `ROLLING_MONTH`
- `Future budget change date`: create mode shows helper copy only; future budget changes are edit-only
- `Future budget (dollars)`: create mode shows helper copy only
- `Operator notes`

Additional UI outputs in the form:

- CPC readiness warning
- ad eligibility badge for the selected business
- exact cents payload preview
- ad categories alias payload preview

Validation:

- CPC monthly budget minimum: `$25.00`
- max bid minimum when autobid is off: `$0.50`
- category aliases must be whitespace-free alias strings, not human labels
- scheduled budget changes are blocked in create mode

Internal route:

- `POST /api/programs`

Internal payload example:

```json
{
  "businessId": "cm123",
  "programType": "CPC",
  "currency": "USD",
  "startDate": "2026-03-20",
  "monthlyBudgetDollars": "650.50",
  "isAutobid": false,
  "maxBidDollars": "24.75",
  "pacingMethod": "paced",
  "feePeriod": "CALENDAR_MONTH",
  "adCategories": ["plumbing", "movers"],
  "scheduledBudgetEffectiveDate": "",
  "scheduledBudgetDollars": "",
  "notes": "Upgrade budget"
}
```

Yelp Ads payload produced by the mapper:

```json
{
  "business_id": "enc_business_123",
  "program_name": "CPC",
  "start": "2026-03-20",
  "currency": "USD",
  "budget": 65050,
  "is_autobid": false,
  "max_bid": 2475,
  "pacing_method": "paced",
  "fee_period": "CALENDAR_MONTH",
  "ad_categories": ["plumbing", "movers"]
}
```

When no categories are selected, the console omits `ad_categories` entirely:

```json
{
  "business_id": "enc_business_123",
  "program_name": "CPC",
  "start": "2026-03-20",
  "currency": "USD",
  "budget": 65050,
  "is_autobid": false,
  "max_bid": 2475,
  "pacing_method": "paced",
  "fee_period": "CALENDAR_MONTH"
}
```

Yelp endpoint:

- `POST /v1/reseller/program/create`

Output:

- `{ "programId": "...", "jobId": "..." }`

Side effects:

- creates local `Program`
- creates local `ProgramJob`
- writes audit event `program.create`
- redirects to `/programs/[programId]?jobId=[jobId]`

#### 4.3 Edit program

Uses the same `ProgramForm` component in edit mode on the program detail page.

Inputs:

- same as create form, except future budget fields are meaningful on edit

Internal route:

- `PATCH /api/programs/[programId]`

Internal payload example:

```json
{
  "programId": "prog_123",
  "businessId": "cm123",
  "programType": "CPC",
  "currency": "USD",
  "startDate": "2026-03-20",
  "monthlyBudgetDollars": "700.00",
  "isAutobid": true,
  "maxBidDollars": "",
  "pacingMethod": "paced",
  "feePeriod": "CALENDAR_MONTH",
  "adCategories": ["plumbing"],
  "scheduledBudgetEffectiveDate": "2026-04-01",
  "scheduledBudgetDollars": "750.00",
  "notes": "Increase next month"
}
```

Yelp edit payload produced by the mapper:

```json
{
  "start": "2026-03-20",
  "budget": 75000,
  "future_budget_date": "2026-04-01",
  "pacing_method": "paced",
  "ad_categories": ["plumbing"]
}
```

Yelp endpoint:

- `POST /v1/reseller/program/{programId}/edit`

Output:

- `{ "programId": "...", "jobId": "..." }`

Side effects:

- creates local edit job
- updates local draft program values immediately
- final status is reconciled by polling
- writes audit event `program.edit`

#### 4.4 Program detail

Page: `app/(console)/programs/[programId]/page.tsx`

Outputs shown:

- program summary
- latest Yelp job card and polling state
- CPC budget operations
- edit form
- audit timeline
- local configuration JSON

#### 4.5 Budget operations

UI component: `components/forms/program-budget-operations.tsx`

Only shown for `CPC` programs.

Tabs and inputs:

- `Current budget`
  - `New monthly budget`
  - `Internal note`
- `Schedule budget`
  - `Future monthly budget`
  - `Effective date`
  - `Internal note`
- `Bid and pacing`
  - `Pacing method`
  - `Max bid`
  - `Internal note`

Purpose of each input:

- budget fields update current or future monthly budget
- effective date schedules the future budget change
- pacing and max bid let operators change bidding behavior without using the full edit form
- internal note is audit-only context, not sent to Yelp

Internal route:

- `POST /api/programs/[programId]/budget`

Internal payload examples:

```json
{
  "operation": "CURRENT_BUDGET",
  "currentBudgetDollars": "325.00",
  "internalNote": "Lower spend for April"
}
```

```json
{
  "operation": "SCHEDULED_BUDGET",
  "scheduledBudgetDollars": "425.00",
  "scheduledBudgetEffectiveDate": "2026-04-01",
  "internalNote": "Seasonal increase"
}
```

```json
{
  "operation": "BID_STRATEGY",
  "pacingMethod": "paced",
  "maxBidDollars": "12.50",
  "internalNote": "Improve lead quality"
}
```

Yelp edit payloads produced:

- current budget: `{ "budget": 32500 }`
- scheduled budget: `{ "budget": 42500, "future_budget_date": "2026-04-01" }`
- bid/pacing: `{ "pacing_method": "paced", "max_bid": 1250 }`

Output:

- `{ "programId": "...", "jobId": "..." }`

Side effects:

- creates local edit job
- audit action types:
  - `program.budget.current.update`
  - `program.budget.schedule.update`
  - `program.bid-strategy.update`

#### 4.6 Terminate program

UI component: `components/forms/program-terminate-form.tsx`

Inputs:

- `Requested end date note`
- `Internal reason note`

Purpose:

- these values are stored for audit context
- current implementation does not send them to Yelp in the upstream terminate payload

Internal route:

- `POST /api/programs/[programId]/terminate`

Internal payload example:

```json
{
  "programId": "prog_123",
  "endDate": "2026-03-31",
  "reason": "Account requested cancellation"
}
```

Yelp payload currently sent:

```json
{}
```

Yelp endpoint:

- `POST /v1/reseller/program/{programId}/end`

Output:

- `{ "programId": "...", "jobId": "..." }`

Side effects:

- creates local `END_PROGRAM` job
- writes audit event `program.terminate`

#### 4.7 Job polling

UI component: `components/forms/job-status-poller.tsx`

Internal route:

- `GET /api/jobs/[jobId]`

Behavior:

- polls while status is `QUEUED` or `PROCESSING`
- stops on terminal states
- persists job status and response
- updates local program status
- updates business ad eligibility after successful or blocked Yelp outcomes

Possible outputs shown:

- status chip
- upstream job ID
- normalized issue summary
- technical details accordion

### 5. Program Features

#### 5.1 Feature inventory page

Page: `app/(console)/program-features/page.tsx`

Outputs shown:

- capability state for the Program Feature API
- all programs with link to manage features

#### 5.2 Per-program feature management

Page: `app/(console)/program-features/[programId]/page.tsx`

One card is rendered for each supported feature type:

- `LINK_TRACKING`
- `NEGATIVE_KEYWORD_TARGETING`
- `STRICT_CATEGORY_TARGETING`
- `AD_SCHEDULING`
- `CUSTOM_LOCATION_TARGETING`
- `AD_GOAL`
- `CALL_TRACKING`
- `BUSINESS_HIGHLIGHTS`
- `VERIFIED_LICENSE`
- `CUSTOM_RADIUS_TARGETING`
- `CUSTOM_AD_TEXT`
- `CUSTOM_AD_PHOTO`
- `BUSINESS_LOGO`
- `YELP_PORTFOLIO`

Internal routes:

- `GET /api/programs/[programId]/features`
- `PUT /api/programs/[programId]/features`
- `DELETE /api/programs/[programId]/features`

Common outputs:

- save success toast
- delete success toast
- local feature snapshot persisted
- audit event written for every update/delete

Feature input reference:

- `LINK_TRACKING`
  - `Destination URL`: landing URL
  - `Tracking template`: optional tracking template URL
- `NEGATIVE_KEYWORD_TARGETING`
  - `Blocked keywords`: comma-separated negative keywords
- `STRICT_CATEGORY_TARGETING`
  - `Enabled`: `true` or `false`
  - `Categories (comma separated)`: categories to keep
- `AD_SCHEDULING`
  - `Schedule JSON`: JSON array of `{ dayOfWeek, startTime, endTime }`
- `CUSTOM_LOCATION_TARGETING`
  - `Neighborhoods`: comma-separated neighborhoods
- `AD_GOAL`
  - `Goal`: one of the feature schema goal values
- `CALL_TRACKING`
  - `Enabled`: `true` or `false`
- `BUSINESS_HIGHLIGHTS`
  - `Highlights`: comma-separated highlight strings
- `VERIFIED_LICENSE`
  - `License number`
  - `Issuing state`
- `CUSTOM_RADIUS_TARGETING`
  - `Radius miles`
- `CUSTOM_AD_TEXT`
  - `Headline`
  - `Description`
  - `Call to action`
- `CUSTOM_AD_PHOTO`
  - `Photo ID`
  - `Caption`
- `BUSINESS_LOGO`
  - `Logo URL`
- `YELP_PORTFOLIO`
  - `Portfolio item IDs`: comma-separated IDs

Feature update payload example:

```json
{
  "type": "NEGATIVE_KEYWORD_TARGETING",
  "keywords": ["jobs", "careers", "free"]
}
```

Delete payload example:

```json
{
  "featureType": "NEGATIVE_KEYWORD_TARGETING"
}
```

Yelp feature behavior:

- updates send the full merged feature collection for the program
- deletes call the feature-specific DELETE endpoint

### 6. Reporting

#### 6.1 Request report

UI component: `components/forms/report-request-form.tsx`

Inputs:

- `Granularity`: `DAILY` or `MONTHLY`
- `Businesses`: one to twenty businesses
- `Start date`
- `End date`
- `Metrics`: selectable metric list

Available metrics:

- `impressions`
- `clicks`
- `adSpendCents`
- `calls`
- `websiteLeads`
- `bookings`
- `totalBusinessViews`

Validation:

- at least one business
- max twenty businesses
- end date must be on or after start date
- daily range max: 31 days
- monthly range max: 24 months

Internal route:

- `POST /api/reports`

Internal payload example:

```json
{
  "granularity": "DAILY",
  "businessIds": ["biz_1", "biz_2"],
  "startDate": "2026-03-01",
  "endDate": "2026-03-31",
  "metrics": ["impressions", "clicks", "adSpendCents"]
}
```

Yelp reporting payload produced:

```json
{
  "business_ids": ["enc_biz_1", "enc_biz_2"],
  "start_date": "2026-03-01",
  "end_date": "2026-03-31",
  "metrics": ["impressions", "clicks", "adSpendCents"]
}
```

Yelp endpoints:

- daily request: `POST /reporting/daily`
- daily fetch: `GET /reporting/daily/{reportId}`
- monthly request: `POST /reporting/monthly`
- monthly fetch: `GET /reporting/monthly/{reportId}`

Output:

- saved report request record
- redirect to `/reporting/[reportId]`

Side effects:

- creates local `ReportRequest`
- persists fetched report payloads to `ReportResult`
- writes audit event `report.request`

#### 6.2 Reporting detail

Page: `app/(console)/reporting/[reportId]/page.tsx`

Outputs shown:

- summary metric cards
- trend chart
- table view
- report generation poller
- CSV export button
- raw JSON payload for admins

Routes used:

- `GET /api/reports/[reportId]?poll=true`
- `GET /api/reports/[reportId]/export`

### 7. Admin Settings

Page: `app/(console)/settings/page.tsx`

Admin-only page.

#### 7.1 Credential forms

UI component: `components/forms/settings-credential-form.tsx`

Credential kinds:

- `ADS_BASIC_AUTH`
- `REPORTING_FUSION`
- `BUSINESS_MATCH`
- `DATA_INGESTION`

Inputs:

- `Label`: internal label shown in settings and health views
- `Username`: used for all non-Fusion credentials
- `Password / secret` or `API key`
- `Base URL`
- `Connection test path`: optional safe read endpoint
- `Enabled`: whether this credential set is active

Purpose:

- stores encrypted secrets server-side
- sets the base URL per integration kind
- lets admins test connectivity without exposing secrets to the browser
- saving an enabled credential automatically updates the related capability flags

Internal route:

- `POST /api/settings/credentials`

Internal payload example:

```json
{
  "kind": "ADS_BASIC_AUTH",
  "label": "Partner API Basic Auth",
  "username": "partner-user",
  "secret": "partner-pass",
  "baseUrl": "https://partner-api.yelp.com",
  "isEnabled": true,
  "testPath": ""
}
```

Save and test route:

- `POST /api/settings/credentials/test`

Test payload:

```json
{
  "kind": "ADS_BASIC_AUTH"
}
```

Outputs:

- save: credential record persisted
- test: `{ "status": "SUCCESS" | "FAILED", "message": "..." }`

Side effects:

- encrypts username and secret
- persists connection test state
- writes audit event for save and test
- toggles matching capability flags based on `isEnabled`

#### 7.2 Capability toggles

UI component: `components/forms/settings-capabilities-form.tsx`

Inputs:

- `adsApiEnabled`
- `programFeatureApiEnabled`
- `reportingApiEnabled`
- `dataIngestionApiEnabled`
- `businessMatchApiEnabled`
- `demoModeEnabled`

Internal route:

- `POST /api/settings/capabilities`

Internal payload example:

```json
{
  "adsApiEnabled": true,
  "programFeatureApiEnabled": true,
  "reportingApiEnabled": false,
  "dataIngestionApiEnabled": false,
  "businessMatchApiEnabled": false,
  "demoModeEnabled": false
}
```

Output:

- saved capability object

Side effects:

- updates `yelpCapabilities` system setting
- writes audit event `settings.capabilities.save`

#### 7.3 Role assignment

UI component: `components/forms/settings-user-role-form.tsx`

Inputs:

- role picker: `ADMIN`, `OPERATOR`, `ANALYST`, `VIEWER`

Internal route:

- `PATCH /api/settings/users`

Internal payload:

```json
{
  "userId": "user_123",
  "roleCode": "OPERATOR"
}
```

Output:

- updated user with role

Side effects:

- updates user role in DB
- writes audit event `settings.user-role.save`

### 8. Audit Log

Page: `app/(console)/audit/page.tsx`

Outputs shown:

- event time
- actor
- action type
- status

Audit is written for:

- business save and readiness patch
- program create, edit, terminate, budget operations
- feature update and delete
- report request
- credential save and test
- capability save
- role save

## Internal API reference

These are the main internal routes used by the UI.

| Route | Method | Purpose | Permission |
| --- | --- | --- | --- |
| `/api/auth/login` | `POST` | Sign in | public |
| `/api/auth/logout` | `POST` | Sign out | signed-in user |
| `/api/businesses` | `POST` | Save business | `businesses:write` |
| `/api/businesses/search` | `POST` | Search local + Business Match | `businesses:read` |
| `/api/businesses/[businessId]/readiness` | `PATCH` | Patch readiness via Data Ingestion | `businesses:write` |
| `/api/programs` | `GET`, `POST` | List or create programs | `programs:read`, `programs:write` |
| `/api/programs/[programId]` | `GET`, `PATCH` | Read or edit program | `programs:read`, `programs:write` |
| `/api/programs/[programId]/budget` | `POST` | Submit focused CPC budget operation | `programs:write` |
| `/api/programs/[programId]/terminate` | `POST` | Submit termination | `programs:terminate` |
| `/api/jobs/[jobId]` | `GET` | Poll program job | `programs:read` |
| `/api/programs/[programId]/features` | `GET`, `PUT`, `DELETE` | Read/update/delete feature state | `features:read`, `features:write` |
| `/api/reports` | `GET`, `POST` | List or request reports | `reports:read`, `reports:request` |
| `/api/reports/[reportId]` | `GET` | Get or poll report | `reports:read` |
| `/api/reports/[reportId]/export` | `GET` | Export CSV | `reports:read` |
| `/api/settings/credentials` | `POST` | Save credentials | `settings:write` |
| `/api/settings/credentials/test` | `POST` | Test saved credentials | `settings:write` |
| `/api/settings/capabilities` | `POST` | Save capability flags | `settings:write` |
| `/api/settings/users` | `PATCH` | Change user role | `settings:write` |

## Local persistence and side effects

Main local entities touched by the current UI:

- `Business`
- `Program`
- `ProgramJob`
- `ProgramFeatureSnapshot`
- `ReportRequest`
- `ReportResult`
- `CredentialSet`
- `SystemSetting`
- `AuditEvent`

Common side effects by workflow:

- every write action records an audit event
- program submits create a local job before contacting Yelp
- job polling updates local program and business state
- report polling caches fetched payloads locally
- settings writes never return saved secrets to the browser

## Known live-account caveats

- Yelp Ads positive-path success still depends on real business state, partner authorization, policy eligibility, and category aliases.
- `UNSUPPORTED_CATEGORIES` means the business itself is not ad-eligible, not that the operator typed the wrong value.
- `BUSINESS_NOT_ACTIVE` means Yelp considers the business inactive or removed from search.
- the Ads credential test is intentionally optional because Yelp Ads does not document a generic health-check endpoint.
- several non-Ads endpoints in this repo are implemented behind typed boundaries but may still need account-specific endpoint confirmation from Yelp.
