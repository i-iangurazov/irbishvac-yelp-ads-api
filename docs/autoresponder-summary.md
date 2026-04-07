# Autoresponder Slice Summary

## What Was Implemented

This slice turns first-response automation into a real, admin-controlled workflow on top of the existing lead ingestion and CRM enrichment foundation.

- Added persistent automation models for:
  - email-only templates
  - matching rules with optional location and service scoping
  - per-lead first-response attempts
  - explicit skip and failure reasons
- Added lead-ingestion trigger logic:
  - runs only when a lead is first created locally
  - prevents duplicate first responses
  - evaluates enable state, rule match, working-hours rules, SMTP readiness, and customer contact availability
- Added delivery handling:
  - `PENDING`, `SENT`, `FAILED`, and `SKIPPED`
  - provider metadata from SMTP send results
  - audit events for successful, skipped, and failed automation outcomes
- Extended lead surfaces:
  - leads list now shows first-response automation state
  - lead detail now shows a separate automation history card
  - rendered subject/body and provider metadata are visible for operator review
- Extended Settings:
  - tenant-level autoresponder enable/disable
  - email template create/edit
  - rule create/edit with optional location/service scoping
  - working-hours controls
- Added tests for:
  - trigger eligibility
  - duplicate prevention
  - template rendering
  - working-hours logic
  - delivery state transitions
  - automation history shaping

## What Remains Out Of Scope

- SMS delivery
- WhatsApp delivery
- AI-generated message writing
- multi-step drip campaigns
- delayed retry queue for after-hours leads
- manual resend workflow
- client-facing inbox or portal
- provider-specific delivery integrations beyond SMTP email

## Assumptions And Limits

- Email is the only supported live channel in this slice because SMTP is already present in the repo. Other channels stay explicitly unsupported.
- The trigger runs on first local lead creation. Repeated webhook deliveries do not create new outbound attempts.
- Working-hours rules skip immediately when outside the configured window. They do not enqueue a later send.
- Customer email must be present on the Yelp lead to send. Missing email records a visible skipped attempt instead of falling back to another channel.
- Templates and rules are internal/local records. They do not come from Yelp and do not alter Yelp-native lead history.

## Manual QA Steps

1. Apply the migration:
   - `pnpm prisma:migrate:deploy`
2. Confirm SMTP env vars are set:
   - `SMTP_HOST`
   - `SMTP_PORT`
   - `SMTP_FROM`
   - optional auth vars as needed
3. Open `/settings` as an admin.
4. In `Lead autoresponder`:
   - enable the autoresponder
   - create a template
   - create a rule that matches your test lead scope
5. Trigger a brand-new lead through the existing Yelp webhook route:
   - `POST /api/webhooks/yelp/leads`
6. Open `/leads`:
   - confirm the new row shows a first-response status
7. Open `/leads/[leadId]`:
   - confirm the Yelp timeline is still separate
   - confirm CRM/internal status is still separate
   - confirm automation history appears as its own section
   - confirm rendered message content and provider metadata appear when sent
8. Negative-path checks:
   - disable autoresponder and ingest a new lead: expect `SKIPPED`
   - remove customer email from the lead payload: expect `SKIPPED` with missing contact
   - set a working-hours-only rule and ingest outside that window: expect `SKIPPED`
   - break SMTP config and ingest a new lead: expect `FAILED` or `SKIPPED`, depending on whether SMTP is unavailable before or during send

## Operational Risks / Limits

- SMTP acceptance does not guarantee final mailbox delivery. This slice records provider send acceptance, not downstream inbox/open tracking.
- A skipped after-hours lead stays skipped until a later slice adds a retry queue.
- Because this is a first-response-only slice, each lead records at most one automation attempt today.
- If admins create no matching rule, the lead records a visible skip instead of silently falling back.
