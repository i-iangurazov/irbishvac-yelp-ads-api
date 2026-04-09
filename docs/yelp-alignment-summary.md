# Yelp Alignment Summary

## 1. What changed to align with Yelp guidance

### Webhook-first intake
- The live webhook route now accepts deliveries quickly and returns `202 Accepted` instead of doing full lead refresh work inline.
- Webhook deliveries are stored as raw `YelpWebhookEvent` records plus queued `SyncRun` records.
- Reconcile processing now performs the heavier Yelp read path asynchronously:
  - parse queued webhook payload
  - `Get Lead`
  - `Get Lead Events`
  - normalize and upsert lead + event records
  - update sync status, audit trail, and retry metadata

### Idempotent processing and retries
- Duplicate webhook deliveries are ignored when the same stable webhook event key was already processed successfully.
- Lead refresh remains idempotent at the lead record layer through `externalLeadId` upserts.
- Retry handling now distinguishes retryable failures from non-retryable ones and only re-queues temporary failures.

### Yelp-thread-first messaging
- Yelp-thread posting remains the primary live reply path for operators and autoresponder.
- Automated replies are explicitly labeled as automated before send.
- Email remains only as fallback support when Yelp-thread delivery is unavailable and a Yelp masked email is available.
- Operator actions now support:
  - post into Yelp thread
  - mark unread as read on Yelp
  - mark replied on Yelp after a real outside-Yelp phone or masked-email follow-up

### Cleaner source boundaries
- Lead detail, Leads filters, settings, and reporting now describe downstream statuses as `partner lifecycle` instead of implying they are Yelp-owned.
- Reply history and automation history distinguish:
  - Yelp thread
  - Yelp masked email fallback
  - outside-Yelp reply markers
  - local processing records

### Privacy and operational safety
- The operator issue detail page no longer exposes lead email directly.
- UI language no longer frames masked-email fallback as generic off-thread email.

## 2. What now matches Yelp's recommended architecture

- Live intake is now webhook-first.
- Webhook handling is fast and queue-oriented.
- Full lead refresh uses the recommended `webhook -> Get Lead -> Get Lead Events -> store` pattern.
- Processing is duplicate-safe and lead refresh is idempotent.
- Yelp-thread reply is the primary live messaging path.
- Automated Yelp replies are clearly labeled as automated.
- Yelp-native intake and engagement stay separate from partner lifecycle records.
- Reporting language keeps Yelp lead/engagement data separate from internal lifecycle and conversion outcomes.

## 3. What remains partial or future work

- Webhook retries currently run through the internal reconcile path, not a dedicated external queue worker or dead-letter service.
- Manual business lead import still exists for support backfill and historical recovery.
- CRM sync is still app-mediated and connector-specific, not a generalized external sync daemon.
- SMTP remains an operational dependency for masked-email fallback.
- Webhook health monitoring is stored and exposed through sync runs, webhook events, and issues, but there is no dedicated SLO dashboard.

## 4. What still uses fallback behavior

- Yelp masked email is still used only when Yelp-thread write is unavailable and the lead has a usable masked email address.
- Manual lead import remains a support path for older lead history and recovery when webhook coverage is incomplete.
- Operator `mark replied` actions are still available for real phone or masked-email follow-up that happened outside the Yelp thread.

## 5. Exact manual QA steps

1. Save a valid Yelp bearer token in `/settings`.
2. Confirm the Leads capability is enabled in `/settings`.
3. POST a valid Yelp leads webhook payload to `/api/webhooks/yelp/leads`.
4. Confirm the route returns `202` and the payload is stored as a queued webhook event.
5. Trigger `/api/internal/reconcile` or the equivalent scheduled reconcile path.
6. Open `/leads` and confirm the queued lead now appears after the webhook refresh.
7. Open `/leads/[leadId]` and confirm:
   - Yelp timeline is shown separately
   - partner lifecycle section is separate
   - local reply/message actions are separate
   - source-boundary copy is explicit
8. Use the reply form with `Yelp thread` and confirm the reply is recorded as a Yelp-thread action.
9. Mark unread as read and confirm the lead detail shows the local action plus refreshed Yelp state when available.
10. Use the outside-reply marker and confirm the action is recorded as a local/operator marker, not as a Yelp-native thread message.
11. Enable autoresponder with a Yelp-thread template and ingest a new lead.
12. Confirm the first response is posted into the Yelp thread when supported.
13. Force a temporary Yelp failure and confirm the webhook sync run is retryable and remains visible through audit/issues.
14. Open reporting and confirm Yelp-native metrics and partner lifecycle metrics remain visually separated.
