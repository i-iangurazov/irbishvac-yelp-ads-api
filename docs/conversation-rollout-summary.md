# Conversation Rollout Summary

## 1. What Rollout Controls Are Now Live

- Tenant defaults now include a conversation **quick pause / kill switch**.
- Conversation posture stays explicit in the product as:
  - human-only
  - review-only pilot
  - limited auto-reply pilot
  - paused
- Tenant defaults remain conservative for new businesses unless a business scope or override explicitly enables conversation automation.
- Business delivery status now shows conversation rollout posture per Yelp business instead of hiding it inside settings.

## 2. What Metrics Are Now Visible

- Rolling conversation metrics are now visible in the Autoresponder module for the recent operating window:
  - automated replies sent
  - review-only decisions
  - human handoffs
  - low-confidence stops
  - max-turn limit hits
  - send failures
  - pricing-risk stops
  - availability-risk stops
  - operator takeovers
  - inferred reply-after-automation rate
- These are operational pilot metrics, not BI/reporting output.

## 3. What Conversation Review Visibility Now Exists

- The Autoresponder module now has a focused **Conversation review operations** surface built from persisted conversation turns.
- Review-only and human-handoff turns stay visible there until a human operator resolves the thread.
- Lead detail now shows:
  - conversation rollout posture
  - whether human review is still needed
  - the last automated conversation decision
  - the stop reason when automation halted
  - any linked issue for the thread

## 4. What Is Now Persisted For Audit/Debug

- Each conversation turn now persists a clearer decision artifact including:
  - classification result
  - confidence
  - rollout state
  - mode label
  - decision summary
  - stop reason summary
  - selected template
  - automated turn count before/after
  - delivery/error context where applicable
- Conversation state metadata now also records rollout label and turn-count context for the latest processed decision.

## 5. What Remains Intentionally Out Of Scope

- No unrestricted autonomous chatbot behavior was added.
- No customer-facing controls or customer-visible UI were added.
- No second incident platform or separate review system was created.
- Review-only turns are visible in the Autoresponder module and lead detail; only risky blocked cases use the existing issue queue.
- This slice does not attempt long-term analytics warehousing or business intelligence reporting.

## 6. Exact Manual QA Steps

1. Open Autoresponder settings and verify the conversation quick pause can be turned on and off.
2. Confirm the Overview and Conversation rollout surfaces reflect:
   - paused
   - review-only pilot
   - limited auto-reply pilot
3. Replay a safe inbound Yelp thread update for a bounded-auto-reply business and confirm:
   - an automated reply is sent
   - conversation metrics increment
4. Replay a review-only business message and confirm:
   - no auto-send
   - a review item appears in Conversation review operations
5. Replay a pricing or availability request and confirm:
   - no auto-send
   - explicit stop reason
   - linked issue if escalation is enabled
6. Open the lead detail page for one review-only or handoff thread and confirm:
   - rollout label
   - human review needed badge
   - last decision
   - stop reason
   - linked issue when present
7. Send a human operator reply on a review item and confirm it disappears from the unresolved review surface.
8. Verify business delivery status shows different rollout posture for:
   - tenant-default business
   - overridden business
   - disabled business

## PR-Style Summary

- Rollout controls:
  - added tenant-wide conversation quick pause
  - made rollout posture explicit in module and lead surfaces
- Analytics:
  - added lightweight conversation safety and performance metrics
- Queue / review:
  - added a persisted-turn-backed conversation review operations surface
  - kept risky escalations on the existing issue queue
- Persistence:
  - expanded conversation turn/state metadata for auditability
- Remaining limitations:
  - still bounded and conservative by design
  - still not a freeform autonomous chatbot
