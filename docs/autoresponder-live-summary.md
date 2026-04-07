# Autoresponder Live Summary

## What is now live

- Admin-configured first-response automation
- Email template and rule management in Settings
- Trigger-on-new-lead behavior
- Duplicate-send prevention
- Working-hours eligibility checks
- Delivery state, skip reason, and provider metadata persistence
- Lead detail automation history
- Audit visibility for automation outcomes

## What is partially live

- Delivery depends on SMTP configuration.
- Only email is operational in this repo.

## What remains out of scope

- SMS
- WhatsApp
- AI copy generation
- multi-step automation
- delayed retry queue

## Manual QA

1. Configure SMTP.
2. Enable the autoresponder in Settings.
3. Save a template and a matching rule.
4. Ingest a new lead.
5. Confirm:
   - lead queue shows automation state
   - lead detail shows automation history
   - `/audit` reflects sent, skipped, or failed actions
