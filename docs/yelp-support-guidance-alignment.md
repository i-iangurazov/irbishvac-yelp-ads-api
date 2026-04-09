# Yelp Support Guidance Alignment

This note captures the concrete project changes made after Yelp support clarified the intended live operating pattern for lead operations.

## Guidance applied

- Prefer Yelp-thread messaging as the primary reply path when supported.
- Keep automated first responses clearly labeled as automated.
- Treat Yelp as the source of truth for lead intake and on-Yelp engagement.
- Treat CRM/internal systems as the source of truth for downstream lifecycle.
- Keep webhook handling idempotent and follow the webhook -> Get Lead / Get Lead Events pattern.
- Track operational health with request-level logging and processing visibility.
- Avoid implying that partner lifecycle stages are official Yelp statuses.

## Product changes

- Autoresponder messages now receive an automatic disclosure before send.
  - Yelp thread: the body is prefixed with `Automated reply from <business>.`
  - External email: the subject is prefixed with `[Automated reply]` and the body receives the same disclosure.
- Lead detail now supports explicit outside-Yelp reply markers.
  - Operators can mark a lead as replied after a phone/SMS follow-up.
  - Operators can mark a lead as replied after an email sent outside the console.
- Lead detail and settings copy now distinguish:
  - Yelp-native thread history
  - partner lifecycle statuses
  - local delivery / sync records
- Yelp request logging now records:
  - API family
  - correlation ID
  - status
  - duration
- Lead webhook and backfill processing now record timing in logs and sync stats.

## Boundaries preserved

- Yelp-thread replies and read/replied markers remain Yelp-native actions refreshed from Yelp.
- Masked-email fallback and outside-Yelp reply markers remain explicit local/operator actions.
- CRM mapping and lifecycle statuses remain partner-managed data, not Yelp-owned statuses.
- Reporting continues to label Yelp batch metrics separately from internal conversion outcomes.

## Still outside scope

- SMS or WhatsApp sending from this console
- webhook signature validation, because Yelp documentation provided to this project does not define a signature flow here
- automated downstream status back-sync into Yelp
- subscription management or business-coverage orchestration
