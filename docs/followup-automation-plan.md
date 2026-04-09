# Follow-up Automation Plan

## Current execution model

- The live autoresponder currently supports one automated first response after a new Yelp lead is ingested.
- Execution starts from the webhook-first lead pipeline in [features/leads/service.ts](/Users/ilias_iangurazov/Commercial/irbishvac-yelp-ads-api/features/leads/service.ts) when a lead is first normalized locally.
- Delivery already uses the Yelp-thread-first path through [features/leads/messaging-service.ts](/Users/ilias_iangurazov/Commercial/irbishvac-yelp-ads-api/features/leads/messaging-service.ts), with masked email only as explicit fallback.
- Business-scoped overrides already exist for enablement, primary channel, masked-email fallback, and AI review-assist settings.

## What is missing today

- Real scheduled follow-up execution does not exist yet.
- The current `LeadAutomationAttempt` model only allows one attempt per lead through `@@unique([leadId])`, so 24-hour and following-week attempts cannot be recorded safely.
- The module copy explicitly says later follow-ups are still manual.
- The reconcile route does not run any autoresponder follow-up worker.
- Stop-condition logic is limited to first-response eligibility and duplicate prevention for the initial attempt only.

## Why follow-ups are blocked today

- The blocker is not the Yelp write path. Yelp-thread delivery is already live.
- The blocker is the execution ledger and scheduler shape:
  - only one automation attempt can exist per lead
  - no cadence or due-time field exists
  - no pending-due reconcile path exists
  - no conservative stop-condition evaluation exists for later sends

## State needed for real follow-up automation

- Multiple automation attempts per lead, distinguished by cadence:
  - initial response
  - 24-hour follow-up
  - following-week follow-up
- A due timestamp for follow-up attempts so the reconcile worker can process only due work.
- Business-scoped cadence settings so a business can enable or suppress follow-ups independently.
- Explicit skip reasons for:
  - customer already replied
  - human/operator already took over
  - partner lifecycle is already far enough along to stop follow-up
  - missing safe thread context
  - cadence disabled
  - duplicate or already-recorded cadence

## Stop conditions required

- Customer already replied in the Yelp thread after the last automated send.
- A human/operator already replied or marked the lead handled outside Yelp after the last automated send.
- The lead has already reached a partner lifecycle state where follow-up would be spammy:
  - booked
  - scheduled
  - job in progress
  - completed
  - canceled
  - closed won
  - closed lost
  - lost
- The same cadence already sent, skipped, or is already pending.
- The business or tenant autoresponder scope is disabled.
- A safe Yelp-thread rule/template cannot be resolved for the cadence.

## What should be business-scoped

- Follow-up enablement for:
  - 24-hour follow-up
  - following-week follow-up
- Cadence windows:
  - 24-hour delay
  - following-week delay
- Existing thread-first and masked-email fallback policy
- Existing AI review-assist settings
- Rule/template selection continues to support business, location, and service scope through the existing rule/template system.

## Rule-model direction

- Keep the current explicit rule system instead of inventing a second automation builder.
- Extend rules so they can target a cadence:
  - initial
  - 24-hour follow-up
  - following-week follow-up
- Reuse current business, location, service, priority, and working-hours gating behavior.
- Reuse current template management, including the existing starter template kinds for `FOLLOW_UP_24H` and `FOLLOW_UP_7D`.

## Execution design

- Main live pattern:
  - new lead ingested
  - initial response evaluated and sent immediately when eligible
  - due follow-up attempts scheduled for later cadences
  - internal reconcile processes due follow-up attempts
  - each follow-up re-checks stop conditions before sending
- Follow-up execution remains deterministic and template-based.
- This slice does not introduce autonomous AI follow-up sending.

## Visibility and issue integration

- Lead detail should show:
  - initial response state
  - next follow-up due
  - follow-up history with cadence labels
  - skipped and failed reasons
  - whether a business override is in effect
- The Autoresponder module should show:
  - cadence policy
  - business-scoped follow-up settings
  - recent follow-up sends, skips, and failures
- Failed or stuck follow-up attempts should continue to surface through the existing `AUTORESPONDER_FAILURE` issue path, not a second failure system.

## Implementation order

1. Extend schema and settings for multi-cadence follow-up state.
2. Extend rule scope to support cadence-specific rule matching.
3. Add follow-up scheduling and due-at reconcile execution.
4. Add stop-condition evaluation and duplicate protection.
5. Update visibility in lead detail, the Autoresponder module, and the operator queue.
6. Add tests for cadence timing, stop conditions, business overrides, and failure handling.

## Manual QA strategy

1. Enable tenant-level follow-up settings and confirm the initial response still sends immediately for a new Yelp lead.
2. Create a business override for a test Yelp business and confirm it changes follow-up policy only for that business.
3. Verify a 24-hour follow-up attempt is scheduled after a successful initial send and does not send before it is due.
4. Verify the 24-hour follow-up posts into the Yelp thread with explicit automated disclosure.
5. Verify a customer reply before the due time causes the follow-up to skip with a clear recorded reason.
6. Verify a human/operator reply before the due time also suppresses the follow-up.
7. Verify a booked or completed partner lifecycle state suppresses later follow-up.
8. Verify the following-week follow-up schedules only once and does not duplicate on reconcile replay.
9. Force a delivery failure and confirm it appears in the existing operator queue as an autoresponder issue with retry.
