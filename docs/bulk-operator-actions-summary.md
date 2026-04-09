# Bulk Operator Actions Summary

## What bulk actions are now live

Bulk operator actions are now live on `/audit`.

Operators can:

- retry selected retryable issues
- resolve selected open issues
- ignore selected open issues
- add one internal note across selected issues

These actions work only against the current filtered queue selection.

## Where they are available

The bulk workflow is available only on the operator queue at `/audit`.

This slice does not add bulk actions to leads, reporting, or customer-facing reply workflows.

## What remains intentionally single-record only

These remain single-record actions:

- Yelp-thread replies
- mark-as-read / mark-as-replied
- CRM remapping
- partner lifecycle status changes
- report schedule configuration
- any customer-facing autoresponder or AI-assisted communication

## Guardrails and audit behavior

- bulk actions appear only when rows are selected
- retry is available only for retryable issues
- resolve and ignore apply only to actionable open issues
- ineligible rows are skipped, not force-updated
- bulk actions return clear success / failure / skipped counts
- every per-issue action still records its own audit event
- each bulk operation also records one summary audit event with targeted IDs and result counts

## Exact manual QA steps

1. Open `/audit`.
2. Filter to a queue state with at least one retryable open issue.
3. Select one or more rows and confirm the bulk action bar appears.
4. Use the header checkbox and confirm it selects only the current filtered rows.
5. Run `Retry selected` and confirm the toast reports success / skipped / failed counts accurately.
6. Run `Resolve selected` with a reason and confirm only open rows are resolved.
7. Run `Ignore selected` with a reason and confirm only open rows are ignored.
8. Run `Add note to selected` and confirm a note audit entry appears on each targeted issue.
9. Change filters and confirm the selection clears automatically.
10. Open one of the affected issue detail pages and confirm per-issue audit events and the bulk summary event are present in audit history.

## Assumptions and limitations

- bulk selection is current-filter only, not cross-page or saved-selection
- there is no bulk export in this slice
- there are no bulk actions on lead messaging, lifecycle mutation, or CRM mapping
- retry still validates each issue record individually, so mixed selections can produce partial success
