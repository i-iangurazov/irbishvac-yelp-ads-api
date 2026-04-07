# Live System Master Plan

## 1. Current state audit

### Route tree

- Primary console routes:
  - `/dashboard`
  - `/leads`
  - `/businesses`
  - `/programs`
  - `/reporting`
  - `/settings`
  - `/audit`
- Secondary routes:
  - `/integrations`
  - `/locations`
  - `/services`
  - `/program-features`
- Key live API routes:
  - `/api/webhooks/yelp/leads`
  - `/api/leads/sync`
  - `/api/leads/[leadId]/crm-mapping`
  - `/api/leads/[leadId]/crm-statuses`
  - `/api/reports`
  - `/api/reports/[reportId]/export`
  - `/api/reports/schedules`
  - `/api/reports/schedules/[scheduleId]/generate`
  - `/api/reports/runs/[runId]/resend`
  - `/api/settings/autoresponder`
  - `/api/issues/[issueId]/*`
  - `/api/internal/reconcile`

### Schema and models

The schema already supports the intended operating loop:

- Yelp-native intake:
  - `YelpLead`
  - `YelpLeadEvent`
  - `YelpWebhookEvent`
  - `SyncRun`
  - `SyncError`
- Internal/CRM enrichment:
  - `CrmLeadMapping`
  - `CrmStatusEvent`
  - `Location`
  - `ServiceCategory`
- Reporting and delivery:
  - `ReportRequest`
  - `ReportResult`
  - `ReportSchedule`
  - `ReportScheduleRun`
- Automation and trust:
  - `LeadAutomationTemplate`
  - `LeadAutomationRule`
  - `LeadAutomationAttempt`
  - `OperatorIssue`
  - `AuditEvent`

### Yelp client and token flow

- Ads partner endpoints use `ADS_BASIC_AUTH`.
- Leads and other `api.yelp.com` bearer-auth reads use:
  1. saved `REPORTING_FUSION` secret in Settings
  2. `YELP_ACCESS_TOKEN`
  3. legacy `YELP_API_KEY`
- Leads client already supports:
  - `GET /v3/businesses/{business_id}/lead_ids`
  - `GET /v3/leads/{lead_id}`
  - `GET /v3/leads/{lead_id}/events`
- Reporting uses the current Yelp reporting request and poll flow.

### What is already real

- Yelp webhook ingestion and raw delivery persistence
- Manual Yelp lead import by business using `lead_ids`
- Normalized lead and lead-event storage with idempotency
- Lead list and lead detail with separate Yelp, CRM/internal, automation, and sync surfaces
- Internal CRM mapping and lifecycle status writes
- Derived conversion metrics from real internal outcomes
- Location and service breakdowns with unknown buckets preserved
- CSV export for report breakdown views
- Recurring weekly/monthly report schedules and delivery runs
- SMTP-backed email delivery with CSV attachment
- First-response autoresponder with templates, rules, working-hours logic, and auditability
- Operator issue queue with retry, resolve, ignore, and note actions

### What is partial

- Yelp webhook delivery is only live if the deployed public route exists and Yelp is pointed at it.
- Yelp lead import currently relies on the first `lead_ids` page returned by Yelp. The UI is honest about `has_more`.
- CRM status sync is operational through authenticated internal routes and operator forms, but there is no separate connector daemon or external webhook consumer yet.
- Report delivery is operational only when SMTP is configured.
- Autoresponder is operational only for email. Other channels remain unsupported.

### What remains intentionally secondary

- `/integrations`
- `/locations`
- `/services`

These routes are still supporting screens, not the primary operator loop.

## 2. Gaps vs target functionality

The repo is already close to the target operating system. The main remaining gaps are:

1. Public webhook deployment and subscription setup still live outside the app.
2. CRM synchronization is write-capable but not yet driven by a dedicated external connector process.
3. Yelp OAuth and business allowlist management still live outside the product.
4. Yelp lead history import is honest but constrained by the upstream `lead_ids` response behavior.
5. Some labels still described the product like a staged MVP rather than a live operations system.

## 3. Execution phases

1. Leads live:
   - make Yelp intake credible through webhook + manual import
   - surface sync status and failure visibility
2. CRM sync:
   - preserve internal mapping and lifecycle state separately from Yelp
3. Conversion analytics:
   - combine Yelp spend with internal outcomes
4. Location and service reporting:
   - keep unknown buckets visible
5. Recurring report generation and delivery:
   - automate weekly/monthly delivery
6. Autoresponder:
   - first-response automation only
7. Operator trust:
   - issue queue, retries, and auditability
8. UX tightening:
   - remove remaining admin-scaffold language

## 4. Data and source-of-truth boundaries

- Yelp-native:
  - lead identity
  - lead event timeline
  - webhook deliveries
  - reporting batch payloads
  - spend from reporting batches
- Internal / CRM-derived:
  - CRM mapping state
  - lifecycle status progression
  - booked, scheduled, in-progress, completed, won/lost outcomes
  - location and service assignment where not present from Yelp
- Internal operational:
  - report schedules and delivery runs
  - autoresponder rules, templates, and attempts
  - operator issues
  - audit trail

The UI and docs must never present internal or operational records as Yelp-owned data.

## 5. Dependency ordering

The system depends on this order:

1. credentials and capability flags
2. Yelp business saved locally
3. lead intake via webhook or import
4. internal mapping and lifecycle status
5. derived analytics
6. breakdown views and exports
7. report scheduling and delivery
8. autoresponder and operator trust overlays

## 6. What can be reused

- App Router route structure
- Prisma models and migrations already present
- existing auth/session and permission model
- Yelp client wrappers
- `SyncRun` / `SyncError` pattern
- `AuditEvent` pipeline
- shared dense table, badge, page header, and empty-state components
- existing reporting aggregation and export path

## 7. What must be refactored or tightened

- Promote Leads into the live primary navigation
- Remove leftover MVP/foundation wording from live settings and dashboard surfaces
- Keep secondary modules visually subordinate
- Keep deployment and SMTP limitations explicit instead of implied away

## 8. Intentionally out of scope

- Yelp features not documented by official partner APIs
- a client portal
- AI-generated messaging
- advanced marketing automation
- PDF-first delivery
- a full OAuth/business subscription management UI
- universal CRM connector coverage for every external system

## 9. Manual QA strategy

- Verify settings with live credentials and capability flags
- Import Yelp lead history for a saved business
- Confirm normalized lead detail and timelines
- Apply CRM mapping and internal statuses
- Verify conversion metrics and report breakdowns
- Generate and deliver a recurring report
- Trigger autoresponder on a new lead
- Review operator issues and retry paths

## 10. Rollout and risk notes

- Start with internal operator tenants only.
- Keep demo mode off for live validation.
- Treat webhook deployment, SMTP, and token rotation as rollout dependencies.
- Preserve explicit warnings around delayed Yelp reporting and partial upstream lead pagination.
- Do not move secondary routes into the main workflow until they support a real operator action loop.
