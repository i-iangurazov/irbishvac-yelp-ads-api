# Conversation Rollout Plan

## 1. What Conversation Automation Can Do Today

- Inbound Yelp thread messages can now trigger bounded conversation handling after the initial lead response.
- The system classifies new inbound customer messages conservatively and routes each turn into one of three outcomes:
  - auto-reply
  - review-only
  - human handoff
- Risky cases already stop correctly for:
  - pricing
  - availability and arrival promises
  - complaints and escalation language
  - low confidence
  - max automated turn limits
  - human takeover
- Per-business conversation settings already exist through tenant defaults and business overrides.
- Each processed turn is persisted with decision, intent, stop reason, rendered output, and metadata.
- Handoff cases can already create operator issues through the existing queue.

## 2. What Rollout Controls Are Missing

- There is no tenant-level quick pause or emergency kill switch for conversation automation.
- The UI does not clearly label whether a business is in:
  - human-only
  - review-only pilot
  - limited auto-reply pilot
- Operators can infer business scope and mode, but the rollout posture is not explicit enough for a production pilot.
- New businesses are conservative by default in schema, but the UI does not make that default posture obvious.

## 3. What Operators/Admins Cannot Yet See Clearly

- There is no lightweight conversation metrics section showing whether the system is behaving safely.
- There is no focused review-operations list for conversation turns that still need human attention.
- Lead detail shows recent turn history, but not whether a review item is still unresolved.
- The Autoresponder module shows first-response and follow-up health better than conversation-specific health.

## 4. What Metrics Are Needed To Judge Quality And Safety

- automated conversation replies sent
- review-only decisions produced
- human handoffs triggered
- low-confidence classifications
- pricing-risk and availability-risk stops
- max-turn limit hits
- send failures
- approximate reply-after-automation rate
- operator takeover / operator-resolution behavior after review or handoff

These should stay operational and concise. This is not a reporting warehouse.

## 5. What Review Queue Behavior Is Needed

- Review-only and human-handoff turns need a focused operator surface, even if they do not all become queue issues.
- Existing operator issues should remain the escalation mechanism for genuinely blocked or risky cases.
- The product needs a concise “conversation review operations” surface built from persisted conversation turns and linked operator issues.
- Review items should be treated as resolved once a human operator takes over the thread after the turn was created.

## 6. What Should Be Persisted For Audit/Debug

- classification result
- confidence
- selected rollout mode
- stop reason
- whether review or issue escalation was required
- automated turn count before and after the decision
- message decision summary
- whether a later human response resolved that turn

These artifacts should stay in internal automation records, not be mixed into Yelp-native customer data.

## 7. Manual QA Strategy

1. Verify tenant-level conversation controls with:
   - conversation enabled
   - review-only
   - bounded auto-reply
   - emergency pause
2. Verify one business inherits tenant defaults and another business uses its own override.
3. Replay safe inbound messages and confirm:
   - limited auto-reply businesses can auto-send
   - review-only businesses store suggestions instead of sending
4. Replay risky pricing and availability requests and confirm:
   - no auto-send
   - explicit stop reason
   - operator issue when escalation is enabled
5. Confirm the Autoresponder module shows:
   - rollout posture
   - conversation metrics
   - review-operations items
6. Confirm lead detail shows:
   - current mode
   - last automated action
   - whether review is still needed
   - why automation stopped
7. Confirm a human reply after a review-only or handoff turn marks that turn as resolved in the operator surfaces.
8. Confirm analytics move when new conversation turns are processed.
