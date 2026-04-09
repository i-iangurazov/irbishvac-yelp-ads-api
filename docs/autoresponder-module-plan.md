# Autoresponder Module Plan

## What exists today

- New Yelp leads already evaluate first-response rules immediately after intake.
- Delivery is already Yelp-thread-first, with Yelp masked-email fallback where configured.
- Templates, rules, and tenant-level enablement already exist.
- Attempt history already exists on lead detail and in issue detection.
- AI reply drafting already exists, but only inside the operator reply composer on lead detail.

## What is currently scattered

- Core configuration lives on the Settings page.
- Operational outcome visibility is split across:
  - lead detail
  - issue queue
  - audit
  - background services
- There is no single page that answers:
  - whether autoresponder is on
  - which rules are live
  - whether AI drafting is enabled
  - what was sent recently
  - what failed recently

## What belongs in a dedicated module

- Overall autoresponder status and current operating mode
- Tenant-level first-response settings
- Template list and editing
- Rule list and editing
- AI drafting status and guardrail summary
- Recent attempt activity
- Recent AI draft activity
- Linked autoresponder issues and failures

## What should remain elsewhere

- Lead-specific message history stays on lead detail.
- Full forensic logs stay in Audit.
- Generic tenant credentials stay in Settings.
- CRM mapping and lifecycle status management stay in Leads and connector surfaces.

## Operator and admin workflows the module should support

- Confirm whether first response is currently enabled
- Confirm whether the live path is Yelp thread first
- See whether email fallback is available
- Review which templates and rules are currently live
- Edit templates and rules in one place
- Confirm whether AI drafting is enabled, env-backed, and still review-only
- Inspect recent sends, skips, failures, and AI draft usage
- Jump into linked issue queue entries when autoresponder behavior failed

## Navigation decision

- The module is now broad enough and operational enough to justify its own page.
- It should move into primary navigation only if the page becomes the single credible place to manage and monitor first-response behavior.

## UX plan

- Add a dedicated `/autoresponder` page.
- Make it concise and operator-grade:
  - compact status row
  - clear operating-mode summary
  - rules/templates table-first management
  - small AI assist section
  - recent activity and linked failures below
- Remove the heavy autoresponder editing surfaces from Settings and replace them with a smaller module summary plus link.

## Data and service plan

- Reuse existing:
  - `LeadAutomationTemplate`
  - `LeadAutomationRule`
  - `LeadAutomationAttempt`
  - existing settings storage
  - existing issue queue
  - existing audit log
- Add module state shaping in `features/autoresponder/service.ts`.
- Add repository helpers for:
  - recent automation attempts
  - attempt summary counts
- Reuse audit log for recent AI draft usage instead of creating a second activity store.

## Config changes needed

- Extend tenant autoresponder settings to explicitly include AI draft assist enable/disable.
- Keep review-required behavior fixed on.
- Keep Yelp-thread-first as the primary live path.
- Keep email fallback explicit and secondary.

## Manual QA strategy

1. Open `/autoresponder` as an admin and confirm the page is useful without going to Settings.
2. Toggle tenant autoresponder enablement and AI draft assist, save, and verify the page refreshes correctly.
3. Create or edit a template and confirm it returns to the module page cleanly.
4. Create or edit a rule, including scoped location/service and working-hours gating.
5. Confirm recent activity shows sent, skipped, failed, and AI draft events where available.
6. Confirm linked autoresponder issues are visible and link into `/audit`.
7. Open Settings and confirm autoresponder is now summarized there rather than managed there.
