# Operator Trust Summary

## What is now live

- Queue-first issue handling on `/audit`
- Normalized issue model with severity, state, timestamps, and linked entities
- Retry paths for report delivery and autoresponder failures
- Manual resolve, ignore, and note actions
- Audit trail for every manual issue action
- Recent audit event and sync-run visibility on the same route

## What operators can do

- prioritize open issues
- filter queue state
- open detail and inspect why something failed
- retry safe workflows
- resolve or ignore with reason

## What remains out of scope

- a separate collaboration or ticketing system
- universal retry support for every issue type
- a background issue-ingestion platform

## Manual QA

1. Open `/audit`.
2. Filter by issue type and severity.
3. Open an issue detail page.
4. Use retry, resolve, ignore, and note where available.
5. Confirm the action appears in audit history.
