# Operator Trust Plan

## Goal

Make failures, stale records, and manual interventions obvious enough that operators can run the system without hidden breakage.

## Current gaps

- The product needs one place to review unresolved system issues.
- Manual actions must be attributable.
- Retry should exist only where it is safe.

## Implementation approach

### Exception model

- Use `OperatorIssue` as the normalized issue record.
- Support:
  - lead sync failure
  - unmapped lead
  - CRM sync failure
  - autoresponder failure
  - report delivery failure
  - mapping conflict
  - stale lead

### Queue UX

- Keep `/audit` queue-first.
- Filter by:
  - issue type
  - business
  - location
  - severity
  - age
  - status

### Detail and actions

- Show linked lead/report/sync context
- show source system and raw details
- support:
  - retry where safe
  - resolve
  - ignore with reason
  - note
  - remap via lead detail when relevant

### Auditability

- Every manual issue action records an audit event with actor and timestamp.

## Known limits

- Issue refresh is request-driven, not a dedicated background reconciler.
- Retry is intentionally not universal.
