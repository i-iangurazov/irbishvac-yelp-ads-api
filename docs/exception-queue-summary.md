# Exception Queue Summary

## What Was Implemented

This slice turns the existing audit area into an operator work queue for system exceptions.

- Added a normalized `OperatorIssue` model with:
  - issue type
  - severity
  - open/resolved/ignored state
  - linked lead/business/location/report/sync entities
  - detected timestamps and count
  - resolution metadata
- Added issue detection and refresh logic for:
  - unmapped leads
  - lead sync failures
  - CRM sync failures
  - mapping conflicts
  - autoresponder failures
  - report delivery failures
  - stale leads without a downstream outcome
- Extended `/audit` into a queue-first operator surface with filtering by:
  - issue type
  - business
  - location
  - severity
  - age
  - status
- Added issue detail at `/audit/issues/[issueId]` with:
  - system context
  - linked record navigation
  - raw issue details
  - retry/remap/resolve/ignore/note actions
  - audit trail for manual actions
- Added safe resolution APIs for:
  - resolve
  - ignore
  - note
  - retry
- Logged all manual issue actions through the existing audit event pipeline.

## Assumptions

- The queue is generated from current system state rather than from a separate background issue-ingestion worker.
- `IGNORED` issues stay ignored when the same condition persists.
- `RESOLVED` issues reopen if the same underlying condition is detected again.
- Retry is intentionally limited to workflows that already have a safe retry path:
  - report delivery resend
  - autoresponder retry
- Remap actions route operators back into the lead detail flow rather than introducing a separate mapping UI.

## Limitations

- There is no dedicated background job yet for periodic issue refresh; the queue refreshes when the audit queue is loaded or detail is viewed.
- Lead/CRM/report issue detection is based on current persisted state and known failure markers, not external provider callbacks beyond what is already stored.
- Manual notes are audit entries, not a separate threaded collaboration system.
- Retry support is not universal. Non-retryable issue types remain review/remap/resolve flows.
- Severity is rule-based and heuristic in a few cases, especially unmapped and stale lead aging.

## Manual QA Steps

1. Open `/audit` and confirm the page leads with the operator queue, not just raw audit history.
2. Apply filters for issue type, severity, status, and age; confirm the table narrows correctly.
3. Open an unmapped lead issue and verify:
   - linked lead navigation works
   - remap action points back to the lead detail page
   - source and severity are visible
4. Open a report delivery failure issue and verify:
   - linked report run context is visible
   - retry action is available
5. Open an autoresponder failure issue and verify retry is available there as well.
6. Use `Resolve` on an open issue and confirm:
   - issue status updates
   - an audit event is recorded with actor and timestamp
7. Use `Ignore` with a reason and confirm:
   - issue status changes to ignored
   - the action appears in the issue audit trail
8. Add an internal note and confirm it appears in the issue action log.
9. Revisit `/audit` and confirm resolved and ignored issues are filterable rather than hidden.
10. Create or seed a known failure condition, reload the queue, and confirm the issue is surfaced with the expected severity and linked entity context.
