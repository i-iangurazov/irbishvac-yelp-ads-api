# Bulk Operator Actions Plan

## Current throughput gaps

The operator queue is the clearest bottleneck today.

Operators can already:

- retry one issue at a time
- resolve one issue at a time
- ignore one issue at a time
- add one internal note at a time

That is workable for isolated failures, but slow when the queue contains repeated lead-sync, downstream-sync, or low-priority unmapped items that need the same handling.

The biggest one-record-only gaps are:

- `/audit` operator queue
- linked issue cleanup after repeated retries or manual review

Lead detail and reporting detail already have focused single-record actions. They do not need bulk controls first.

## Screens that should support bulk actions now

Start with `/audit` only.

This page already:

- lists normalized operator issues
- exposes safe retryability state
- exposes actionable open/resolved/ignored state
- acts as the main operational queue

Bulk support on `/leads` should stay out of scope for now because lead-level actions touch customer-facing workflows and partner lifecycle state too directly.

## Safe bulk actions now

Safe and useful:

- bulk retry for retryable open issues
- bulk resolve for selected open issues
- bulk ignore / dismiss for selected open issues
- bulk add internal note across selected issues

Low-priority or out of scope for this slice:

- bulk export
- bulk remap
- bulk partner lifecycle mutation
- bulk messaging
- bulk autoresponder sends

## Actions that must remain single-record

These stay single-record because they are too risky or too context-sensitive:

- Yelp-thread replies
- mark-as-read / mark-as-replied
- CRM mapping edits
- partner lifecycle status changes
- report schedule edits

## Audit requirements

Bulk actions must record:

- actor
- timestamp
- bulk action type
- targeted issue IDs
- eligible IDs
- skipped IDs
- per-issue failures where they occur
- success / failure counts

Single-issue audit events should remain intact, with one additional bulk summary event for operator visibility.

## UI pattern

Use a queue-first, table-native pattern:

- row checkbox
- header select-all for current filtered rows
- selected-count bar that appears only when something is selected
- inline bulk controls, not a large modal flow
- clear action eligibility messaging
- partial-success result feedback in a toast

Selection should be filter-aware and reset when the filtered row set changes.

## Manual QA strategy

1. Open `/audit` with a mix of retryable and non-retryable issues.
2. Select one retryable issue and confirm the bulk action bar appears.
3. Select all filtered rows and confirm only valid actions show enabled counts.
4. Run bulk retry and confirm success, failure, and skipped counts are returned clearly.
5. Run bulk resolve with a reason and confirm only open issues are changed.
6. Run bulk ignore with a reason and confirm ignored status is applied only to eligible rows.
7. Add a bulk internal note and confirm note audit entries appear on each targeted issue.
8. Change filters and confirm the selection resets cleanly.
9. Review audit history to confirm both per-issue actions and bulk summary actions are recorded.
10. Confirm no customer-facing messaging or lifecycle mutation is available as a bulk action.
