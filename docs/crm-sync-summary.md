# CRM Sync Summary

## What is now live

- CRM mapping state on each lead
- internal lifecycle timeline separate from Yelp events
- conflict, error, unresolved, and stale-state visibility
- authenticated API routes for internal mapping and status writes
- audit and sync-run recording for CRM enrichment actions

## What operators can do

- link a Yelp lead to internal CRM/job identifiers
- record internal lifecycle stages
- see current mapping health and issue messages
- distinguish CRM-sourced versus internal/manual records

## What is partially live

- The repo supports internal/client API writes through authenticated routes and operator forms.
- It does not yet ship a separate background connector for ServiceTitan or another CRM.

## What remains out of scope

- CRM-side search or browse UI
- bulk mapping workflows
- automatic pull-based connector orchestration

## Manual QA

1. Open a lead detail page.
2. Save a CRM mapping.
3. Add one or more lifecycle statuses.
4. Confirm:
   - lead queue shows the new mapping and internal status
   - lead detail shows a separate internal timeline
   - `/audit` shows CRM enrichment activity
