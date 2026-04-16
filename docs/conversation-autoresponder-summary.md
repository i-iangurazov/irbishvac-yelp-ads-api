# Conversation Autoresponder Summary

## What Conversation Automation Is Now Live

- The Yelp-thread autoresponder can now react to new inbound customer thread messages, not just the first lead intake event.
- Inbound customer messages are classified conservatively into bounded intent categories before any response decision is made.
- Each lead now carries explicit conversation automation state:
  - enabled or disabled
  - current mode
  - automated turn count
  - last automated reply timestamp
  - last processed inbound event
  - last decision and stop reason
  - human takeover and escalation markers
- Each processed inbound turn is stored as an auditable conversation automation turn record with:
  - source event key
  - intent
  - decision
  - confidence
  - stop reason
  - rendered suggestion or sent message
  - error summary where relevant

## What Remains Review-Only

- Any business configured to `Review only` for conversation automation.
- Low-risk inbound messages that hit review fallback because bounded auto-reply is not enabled for that business.
- AI-generated bounded suggestions that are prepared for operator review instead of being sent automatically.
- Risky or unclear messages do not become review-only by default if the policy says they require handoff; they stop and escalate instead.

## What Can Auto-Reply Safely

- Only businesses explicitly configured for `Bounded auto-reply`.
- Only low-risk intent categories allowed in that business policy.
- Safe starter families and AI-bounded adaptations built around:
  - acknowledgement
  - we received your update
  - request for more details
  - booking-next-step prompt
  - cannot-estimate-yet clarification
- Auto-replies remain inside the Yelp thread and keep the automated disclosure near the top.
- If AI is disabled, unavailable, or rejected by guardrails, the system falls back to deterministic template content.

## What Always Requires Human Takeover

- Pricing and estimate requests.
- Availability, arrival-time, and scheduling promises.
- Complaint, frustration, or escalation language.
- Unsupported or ambiguous requests.
- Threads that exceed the configured automated turn limit.
- Threads where a human operator already took over.
- Threads with missing Yelp-thread context.
- Low-confidence inbound classification.

## What Settings Were Added

- Tenant and business override settings now include:
  - conversation automation enabled or disabled
  - response mode: review-only, bounded auto-reply, human handoff
  - allowed low-risk intent categories for auto-reply
  - max automated turns per lead thread
  - review fallback behavior
  - issue-queue escalation behavior
- Autoresponder overview and business override surfaces now show conversation policy clearly instead of burying it in hidden logic.

## What Remains Intentionally Out Of Scope

- Unrestricted autonomous AI chat.
- Automatic pricing, availability, coverage, guarantee, or booking commitments.
- Infinite automated back-and-forth in the Yelp thread.
- Off-thread conversation as the primary reply path.
- Replacing the operator queue with a second conversation-specific issue system.

## Manual QA Steps

1. Open `Autoresponder` and confirm tenant defaults or a business override has conversation automation enabled.
2. For one business, test `Review only` mode with a safe inbound message replay.
3. Confirm the lead detail page shows:
   - conversation mode
   - automated turn usage
   - last decision
   - last intent
   - stop reason if automation stopped
4. For the same business, switch to `Bounded auto-reply` and allow only low-risk intents.
5. Replay a safe acknowledgement or detail-provided Yelp inbound event for a real lead.
6. Confirm the system records a conversation automation turn and either:
   - sends an automated Yelp-thread reply, or
   - stores a review suggestion if configured that way.
7. Replay a pricing or availability request.
8. Confirm no auto-send happens, the decision becomes human handoff, and the issue queue receives an actionable issue when escalation is enabled.
9. Replay enough safe inbound turns to exceed the configured max automated turns.
10. Confirm the next turn stops with `Max automated turns reached`.
11. Send or simulate a human operator reply on the lead.
12. Replay another inbound message and confirm automation stops with human takeover.
13. Check `Autoresponder` overview and the lead detail page for updated trust signals and counts.

## PR-Style Summary

- Conversation state changes: added explicit per-lead conversation automation state and auditable per-turn records.
- Inbound message handling: added conservative Yelp-thread inbound classification and bounded routing into auto-reply, review-only, or human handoff.
- New settings: added tenant and business-scoped conversation mode, allowed intents, max turn limits, review fallback, and escalation controls.
- Operator visibility: added conversation policy and last-action visibility on the lead detail page and Autoresponder module.
- Queue integration: risky or failed conversation turns now reuse the existing operator issue queue.
- Remaining limitations: local `pnpm prisma:migrate:deploy` still fails with the Prisma schema-engine issue in this environment, so the SQL migration was added manually and needs fresh-db verification in a clean production-like environment.
