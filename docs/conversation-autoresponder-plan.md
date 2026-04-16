## Current flow

The current system is still lead-event driven, not conversation-turn driven.

- Yelp posts a lead webhook to `/api/webhooks/yelp/leads`.
- The platform enqueues a `YELP_LEADS_WEBHOOK` sync run plus a raw `YelpWebhookEvent`.
- Reconcile drains that queue, refreshes the lead from Yelp, normalizes `YelpLeadEvent` rows, then calls `processLeadAutoresponderForNewLead(...)`.
- The autoresponder currently supports:
  - initial response
  - 24-hour no-response follow-up
  - 7-day no-response follow-up
- Live sends already stay inside the Yelp thread unless explicit masked-email fallback is used for the initial response.
- Live content is rule + template driven, with optional AI-assisted rendering behind template guardrails and fallback copy.

## What is already modeled well

Inbound thread activity is modeled well enough to extend without inventing a second thread system.

- `YelpLeadEvent` already stores:
  - `eventType`
  - `actorType`
  - `occurredAt`
  - `isReply`
  - raw payload
- `LeadConversationAction` already stores:
  - sent/failed local actions
  - initiator
  - channel
  - rendered copy
  - provider metadata
- `LeadAutomationAttempt` already stores:
  - sent / failed / skipped state
  - skip reasons
  - rendered content
  - linked rule/template

This gives the platform enough source separation:

- Yelp-native facts: `YelpLeadEvent`
- local send attempts/actions: `LeadConversationAction`
- automation execution history: `LeadAutomationAttempt`

## What is missing today

The current system has no explicit conversation automation model after the first reply.

- No per-thread conversation mode:
  - review-only
  - bounded auto-reply
  - human handoff required
- No explicit per-thread automated turn counter
- No explicit human-takeover / blocked / escalated state
- No inbound intent classification layer
- No business-scoped allowed-intent policy
- No max automated turns limit
- No operator-facing stop reason for inbound conversation handling

Current settings are also too narrow for this slice. They only cover:

- enabled / disabled
- channel
- follow-up delays
- AI model

That is enough for first reply + timed follow-up, but not for bounded multi-turn handling.

## State model needed

Add an explicit local conversation automation layer instead of hiding logic inside ad hoc checks.

Recommended additions:

- Business-scoped conversation policy in tenant defaults and business overrides:
  - `conversationAutomationEnabled`
  - `conversationMode`
  - `allowedAutoReplyIntents`
  - `maxAutomatedTurns`
  - fallback / escalation behavior
- Per-lead conversation state:
  - effective mode
  - automated turn count
  - last automated reply timestamp
  - last inbound customer event processed
  - last classified intent
  - last decision
  - blocked / escalated reason
  - human takeover timestamp
- Per-inbound-turn decision history:
  - source Yelp event key
  - classified intent
  - decision
  - why it was auto-sent, review-only, or handed to a human

## What should auto-reply vs review-only vs human-only

The automation should stay conservative.

Safe bounded auto-reply:

- customer provided missing details
- simple acknowledgement of update
- simple next-step clarification
- “we received your update” response
- request for one missing operational detail

Review-only by default:

- booking intent
- ambiguous service descriptions
- messages where AI can draft safely but the business still wants operator confirmation

Human-only / blocked:

- pricing / quote requests
- availability / arrival-time promises
- complaints, frustration, escalation tone
- unclear service / coverage fit
- low-confidence classification
- max automated turns reached
- human takeover already happened

## Guardrails needed

Hard stop conditions must be explicit and auditable.

- no pricing / estimate promises unless the business has a safe deterministic script and policy allows it
- no availability / arrival promises
- no invented coverage / warranty / licensing / guarantees
- no more than the configured automated turn limit
- no auto-send when thread context is insufficient
- no auto-send after human takeover
- no auto-send when classification confidence is low
- no auto-send when customer tone indicates escalation or complaint
- every blocked decision should store a concrete stop reason

## Hybrid response strategy

Do not turn this into freeform chat.

- Rules and policies decide whether automation can act
- Template families define the safe response shape
- AI can only adapt bounded copy where policy allows it
- A deterministic fallback remains required
- Automated disclosure stays near the top when the system auto-sends

Recommended template families:

- acknowledgement
- request more details
- received your update
- booking-next-step prompt
- cannot-estimate-yet clarification

## Operator visibility needed

Lead detail and Autoresponder need concise conversation status, not raw debug sprawl.

Lead detail should show:

- conversation mode
- automated turn count
- last automated action
- last stop reason
- suggested next action
- linked issue when escalated

Autoresponder module should show:

- whether conversation automation is enabled
- default mode
- business override mode
- allowed auto-reply intents
- max automated turns

Issue queue should surface:

- risky pricing / availability requests
- customer escalation / frustration
- max-turn limit reached
- repeated low-confidence inbound classification
- send failures

## Manual QA strategy

1. Create or replay a Yelp webhook that adds a real inbound customer thread message.
2. Verify the lead sync refreshes `YelpLeadEvent` rows.
3. Confirm the platform creates or updates conversation automation state for the lead.
4. Test `review-only` mode:
   - inbound message should not auto-send
   - suggested reply should be visible
   - no unsafe thread send occurs
5. Test `bounded auto-reply` mode with a safe intent:
   - one short Yelp-thread reply should send
   - automated disclosure should be present
   - automated turn count should increment
6. Test risky intents:
   - pricing request
   - availability request
   - complaint/escalation
   - each should stop automation and surface a clear reason
7. Test human takeover:
   - send a manual operator reply
   - replay another inbound customer message
   - conversation automation should stop or require review according to policy
8. Test max-turn limit:
   - keep replaying safe inbound updates
   - verify the system stops auto-sending once the cap is reached
9. Verify linked issues appear only for blocked / escalated / failed cases, not for normal safe auto-replies.
