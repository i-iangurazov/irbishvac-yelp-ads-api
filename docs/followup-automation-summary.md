# Follow-up Automation Summary

## What follow-up automation is now live

The autoresponder now supports three rule-based Yelp-thread cadences:

1. Initial response
   - sent as soon as possible after lead intake through the existing webhook-first lead flow
   - operational target remains near-immediate, with short async delay acceptable
2. 24-hour follow-up
   - scheduled after a successful initial automated reply
   - only sends when the lead is still eligible
3. Following-week follow-up
   - scheduled after a successful initial automated reply
   - only sends when the lead is still eligible

All automated follow-ups stay in the Yelp thread. They use explicit disclosure near the top of the message and do not silently fall back to masked email.

## Supported cadences

- `INITIAL`
- `FOLLOW_UP_24H`
- `FOLLOW_UP_7D`

Cadence settings are configurable at:
- tenant default scope
- business override scope

Each business override can independently control:
- enabled / disabled
- default initial channel
- masked-email fallback policy for the initial response only
- 24-hour follow-up enabled / disabled
- 24-hour delay in hours
- following-week follow-up enabled / disabled
- following-week delay in days
- AI assist enabled / disabled
- approved AI model

## Stop conditions

Automated follow-up is skipped when any of these conditions apply:

- autoresponder disabled for the tenant or business scope
- the specific follow-up cadence is disabled
- the lead already has an attempt for that cadence
- Yelp thread context is missing
- no earlier automated thread reply exists
- the customer already replied after the last automated message
- a human operator already took over the conversation
- the lead reached a stopping partner lifecycle state
  - booked
  - scheduled
  - job in progress
  - completed
  - canceled
  - closed won
  - closed lost
  - lost
- no enabled matching rule exists
- the matching template is disabled
- the rule/template is not thread-safe for follow-up
- the rule is outside configured working hours

Skipped reasons are stored explicitly and appear in automation history.

## Visibility and operator controls

Visibility was added to:

- Leads detail
  - automation history now includes cadence labels
  - next follow-up due is shown when scheduled
  - automation scope shows whether a business override is active
- Autoresponder module
  - operating mode now reflects live follow-up policy
  - module summary shows scheduled and due follow-up counts
  - rules show cadence clearly
  - business overrides show follow-up settings per Yelp business
- Operator queue
  - failed autoresponder attempts now remain retryable per attempt
  - follow-up failures are distinguished from initial response failures by cadence-aware issue summaries

The internal reconcile job now also processes due follow-up attempts.

## What remains intentionally out of scope

- freeform autonomous AI follow-up sending
- off-thread follow-up as the primary path
- aggressive multi-step drip campaigns
- automatic requeueing outside working hours
- unlimited follow-up cadences beyond the initial, 24-hour, and following-week rules
- full historical multi-page Yelp import in a single backfill run

## Exact manual QA steps

1. Open `/autoresponder`.
2. Enable the tenant-level autoresponder and confirm the default channel is `Yelp thread`.
3. Enable `24-hour follow-up` and `Following-week follow-up`.
4. Optionally create or update a business override for a test Yelp business and confirm the override row shows the business-specific cadence settings.
5. Ensure there is an enabled `INITIAL` rule and enabled `FOLLOW_UP_24H` / `FOLLOW_UP_7D` rules using Yelp-thread templates.
6. Ingest a new Yelp lead for the scoped business.
7. Open the lead detail page.
8. Confirm:
   - the initial automated message appears in automation history
   - automation scope reflects tenant or business override correctly
   - next follow-up due is visible
9. Trigger the internal reconcile route after the follow-up due window or adjust test data to make a follow-up due.
10. Confirm the due follow-up posts into the Yelp thread, not masked email.
11. Confirm the message starts with the automated disclosure text.
12. Reply as the customer or simulate a customer reply event.
13. Trigger reconcile again and confirm later follow-up is skipped with `CUSTOMER_REPLIED`.
14. Mark the lead booked or completed through partner lifecycle sync.
15. Trigger reconcile again and confirm any remaining follow-up is skipped because lifecycle state suppresses automation.
16. Force a thread delivery failure and confirm an `AUTORESPONDER_FAILURE` issue appears in `/audit`.
17. Retry the issue from `/audit` and confirm the retry acts on the specific failed attempt instead of creating a duplicate send.
