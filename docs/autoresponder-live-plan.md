# Autoresponder Live Plan

## Goal

Automate the first response for a new lead where the tenant has explicitly configured it, without turning the product into a marketing automation system.

## Current gaps

- New lead intake needs a controlled first-response path.
- Operators need visible skip/failure reasons, not silent non-sends.
- Message history must stay separate from Yelp-native and CRM/internal events.

## Implementation approach

### Settings

- Tenant-level enable/disable setting
- Email-only templates
- Rule matching by location and service
- Working-hours controls

### Trigger

- Run only when a lead is first created locally
- Prevent duplicate sends on repeated webhook deliveries or repeated imports
- Evaluate:
  - global enable state
  - template enabled state
  - rule match
  - SMTP readiness
  - working-hours rule
  - customer contact availability

### Delivery and audit

- Persist attempt rows in `LeadAutomationAttempt`
- Track:
  - `PENDING`
  - `SENT`
  - `FAILED`
  - `SKIPPED`
- Store provider metadata and reason codes
- Record audit events for sent, skipped, and failed outcomes

### Operator surfaces

- Settings for rules and templates
- Lead queue summary status
- Lead detail automation history card

## Scope limits

- Email only
- first response only
- no AI-generated messaging
- no drip campaigns
- no delayed queue for after-hours sends
