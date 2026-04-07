# Exception Queue Plan

## Current Error Surface Audit

The repo already records operational failures, but the information is fragmented:

- `SyncRun` and `SyncError` capture webhook, CRM, and reporting sync failures.
- `CrmLeadMapping` and CRM health logic expose unresolved, conflict, stale, and failed mapping states on lead detail.
- `LeadAutomationAttempt` captures first-response failures and skip reasons.
- `ReportScheduleRun` captures generation and delivery failures for recurring reports.
- `AuditEvent` captures manual operator actions and some system outcomes.

The current operator problem is not lack of data. It is lack of consolidation. An operator has to inspect multiple pages to answer:

- what is broken now
- which issues need action first
- what can be retried safely
- which issues are still open versus intentionally dismissed

## MVP Slice Goal

Create one focused operator queue that normalizes the current failure and exception signals into a single work list, while preserving links back to the source records.

The queue should prioritize:

- lead intake issues
- CRM mapping and enrichment issues
- autoresponder failures
- report delivery failures
- stale leads that still need an outcome

## Proposed Model

Add a normalized `OperatorIssue` model.

It will store:

- issue type
- severity
- status: `OPEN`, `RESOLVED`, `IGNORED`
- source system
- title and summary
- dedupe key
- first detected / last detected timestamps
- linked business, location, lead, report request, report schedule run, and sync run where available
- resolution metadata:
  - resolved / ignored timestamp
  - actor
  - reason
  - note

This model is intentionally narrow. It does not replace `SyncError`, `LeadAutomationAttempt`, or `ReportScheduleRun`. It points to them.

## Issue Types In Scope

- `LEAD_SYNC_FAILURE`
- `UNMAPPED_LEAD`
- `CRM_SYNC_FAILURE`
- `AUTORESPONDER_FAILURE`
- `REPORT_DELIVERY_FAILURE`
- `MAPPING_CONFLICT`
- `STALE_LEAD`

## Detection / Refresh Approach

Use a server-side refresh step before rendering the queue and detail pages.

This refresh will scan existing records and upsert normalized issues by dedupe key:

- failed or partial lead webhook sync runs -> `LEAD_SYNC_FAILURE`
- unresolved lead mappings -> `UNMAPPED_LEAD`
- CRM sync failures / mapping errors -> `CRM_SYNC_FAILURE`
- CRM mapping conflicts -> `MAPPING_CONFLICT`
- failed or stuck autoresponder attempts -> `AUTORESPONDER_FAILURE`
- failed report schedule runs -> `REPORT_DELIVERY_FAILURE`
- aged leads without downstream outcome -> `STALE_LEAD`

Behavior rules:

- if the underlying condition still exists, the issue stays active
- resolved issues reopen if the underlying condition returns
- ignored issues stay ignored until the operator changes them
- open issues auto-resolve when the underlying condition clears

This keeps the queue honest. Operators cannot “resolve away” a still-broken source condition.

## Operator UX

### Queue view

Use the existing `/audit` route as the work queue entrypoint.

Add:

- filter bar:
  - issue type
  - client / business
  - location
  - severity
  - age bucket
  - status
- dense issue table
- links to detail pages
- recent audit trail below the queue

### Detail view

Add an issue detail page under `/audit/issues/[issueId]`.

Show:

- issue summary and severity
- why it exists
- source system
- linked lead / business / report / sync run
- retryability
- raw context blocks where useful
- manual audit trail for notes, ignores, resolves, and retries

## Resolution Actions

Support only safe actions backed by existing workflows:

- retry:
  - report delivery failure -> resend report run
  - autoresponder failure -> retry the existing first-response attempt
- remap:
  - link to the existing lead detail page for CRM mapping work
- mark resolved
- ignore / dismiss with reason
- add internal note

Every manual action must create an `AuditEvent` with the issue ID as the correlation key.

## Assumptions

- `IGNORED` is an explicit operator suppression state. It should not silently reopen on the next refresh.
- `RESOLVED` can reopen if the source condition still exists or comes back.
- stale lead threshold will be conservative and explicit, not implied. Initial proposal: 3 days without downstream outcome.
- retry support will stay narrow. If no safe underlying retry exists, the detail view will show context and the next manual workspace instead.

## Risks / Limits

- issue refresh is derived from current records, so the quality of queue output depends on the accuracy of the underlying lead / sync / delivery records.
- unresolved lead volume can become noisy if every fresh lead is immediately treated as an issue. The queue should use severity and age to keep triage reasonable.
- some retries remain manual because upstream flows are intentionally not automated yet.
