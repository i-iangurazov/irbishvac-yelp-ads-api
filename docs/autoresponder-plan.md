# Autoresponder Plan

## Current Foundation

- Leads ingestion is real and webhook-driven.
- Lead detail already separates:
  - Yelp-native event history
  - CRM/internal lifecycle history
  - local delivery and sync diagnostics
- CRM enrichment and reporting are already storing internal outcomes separately from Yelp data.
- Settings is the current admin-only configuration surface.
- The repo has one real outbound transport today:
  - SMTP email
- The repo does **not** have:
  - SMS provider integration
  - WhatsApp provider integration
  - generic notification infrastructure

## Scope For This Slice

- Build a trustworthy first-response autoresponder for new leads.
- Keep automation admin-controlled and auditable.
- Use the real lead ingestion path as the trigger source.
- Implement real outbound email delivery.
- Keep SMS and WhatsApp explicitly out of scope until a provider exists in the repo.

## Trigger Conditions

- Trigger evaluation only when a lead is first created locally from Yelp ingestion.
- Do **not** re-trigger on duplicate webhook deliveries or later Yelp activity.
- Before sending:
  - confirm tenant autoresponder is enabled
  - find the best matching enabled rule
  - confirm the selected template is enabled
  - confirm the channel is actually supported
  - confirm a deliverable contact exists
  - confirm the lead falls inside configured working hours when required
- Always persist the automation decision:
  - `SENT`
  - `FAILED`
  - `SKIPPED`

## Rule Model

### Global setting

- Use a tenant-level system setting for:
  - autoresponder enabled / disabled

### Template

- Add a template model that stores:
  - name
  - channel
  - enabled state
  - subject template
  - body template
- Variables supported in this slice:
  - `{{customer_name}}`
  - `{{business_name}}`
  - `{{location_name}}`
  - `{{service_type}}`
  - `{{lead_reference}}`

### Rule

- Add a rule model that stores:
  - name
  - enabled state
  - channel
  - linked template
  - optional location scope
  - optional service scope
  - working-hours enabled flag
  - timezone
  - working days
  - start / end time
  - priority
- Matching logic:
  - only enabled rules
  - location/service-specific rules should outrank tenant-wide fallback rules
  - if multiple rules match, use the highest priority then highest specificity

## Delivery Model

- Add an attempt model that stores:
  - lead ID
  - business / location / service references when available
  - selected rule and template
  - channel
  - status
  - skip reason
  - recipient
  - rendered subject
  - rendered body
  - provider response metadata
  - error summary
  - timestamps
- Duplicate prevention:
  - only one automatic first-response attempt per lead/channel in this slice
  - duplicate webhook deliveries should not produce duplicate sends

## Admin UX

- Keep admin configuration inside the existing Settings page.
- Add a focused “Lead autoresponder” section with:
  - global enable/disable
  - supported channel note
  - template list
  - rule list
  - create / edit form
- Keep unsupported channels explicit:
  - Email is supported now
  - SMS and WhatsApp are not wired in this repo yet

## Lead Detail UX

- Extend lead detail with an automation history card that shows:
  - sent / failed / skipped states
  - channel
  - recipient
  - rule/template used
  - rendered content
  - skip / failure reason
- Keep it visually separate from:
  - Yelp-native events
  - CRM/internal lifecycle statuses
  - local sync delivery diagnostics

## Assumptions And Limits

1. This slice uses SMTP email only.
   - SMS and WhatsApp stay out of scope until a provider exists.
2. “Working hours” means send now or skip now.
   - deferred send queues are out of scope in this slice
3. Automation triggers only on first local lead creation.
4. Template rendering is token replacement only.
   - no AI generation
   - no conditional template language
5. This is not a full campaign or nurture system.
   - one immediate first response only
