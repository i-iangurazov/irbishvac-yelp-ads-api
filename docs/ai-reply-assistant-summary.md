# AI Reply Assistant Summary

## What AI assistance is now live

- Operators can generate AI-assisted reply drafts directly inside the existing lead reply composer.
- Draft generation works for the currently selected live reply channel:
  - Yelp thread
  - Yelp masked email fallback
- The AI flow stays inside the current Yelp-thread-first reply workflow instead of introducing a new messaging surface.
- Operators can:
  - generate drafts
  - review warning states
  - insert a draft into the composer
  - regenerate drafts
  - discard drafts

## What remains strictly human-reviewed

- AI does not send messages automatically.
- Operators must review and submit the final reply manually through the existing reply form.
- Final sending still uses the existing live reply routes and message delivery logic.
- Off-thread follow-up markers remain explicit manual actions.

## Guardrails implemented

- Safe context only:
  - recent Yelp thread context
  - business name
  - location name where known
  - service category or mapped service label where known
  - after-hours hint when a matching working-hours rule exists
  - approved template tone guidance when an enabled automation rule already provides it
- Explicit prompt restrictions:
  - no prices
  - no arrival-time promises
  - no availability guarantees
  - no invented services or service areas
  - no legal, warranty, licensing, or compliance claims
  - short operational tone only
- Post-generation checks:
  - pricing claim detection
  - availability/timing claim detection
  - guarantee/compliance claim detection
  - service-invention wording detection
- If risky output is detected, the system falls back to a deterministic safe draft and flags the result for human review.

## Audit and usage tracking

- Audit events now record:
  - AI draft generation success
  - AI draft generation failure
  - AI draft discard
  - AI-generated draft used in a sent reply
- Sent replies can carry AI draft metadata indicating:
  - which draft was used
  - whether the operator edited it before sending
  - any warning codes present at generation time

## What remains intentionally out of scope

- AI auto-send
- autonomous follow-up agents
- pricing estimation
- scheduling promises
- new outbound channels beyond the existing Yelp-thread-first flow and masked-email fallback
- AI analytics dashboards
- long-form conversation coaching outside the reply composer

## Assumptions and limitations

- AI drafting is env-configured, not admin-configured in-product.
- The feature requires `OPENAI_API_KEY`.
- `OPENAI_REPLY_MODEL` is optional and defaults to `gpt-5.2`.
- Draft quality depends on the quality of stored Yelp thread context and known service/location mappings.
- If thread context is sparse, the assistant intentionally stays generic and safe.

## Manual QA steps

1. Set `OPENAI_API_KEY` in the environment and restart the app.
2. Open a lead detail page with a real Yelp thread history.
3. In the reply card, keep `Yelp thread` selected and click `Generate draft`.
4. Confirm:
   - one to three short draft suggestions appear
   - nothing is sent automatically
   - warning badges appear when context is thin or risky
5. Click `Use draft` on one suggestion and verify it populates the existing reply composer.
6. Edit the draft slightly and send it through the existing Yelp-thread reply action.
7. Confirm the message appears through the normal sent-message path and not as a separate AI channel.
8. Generate drafts again and click `Discard drafts`; confirm the composer remains manual and the draft list clears.
9. Switch the reply channel to `Yelp masked email fallback`, generate drafts again, and confirm the email variant includes a subject when available.
10. Review the audit log and confirm draft generation, discard, and AI-assisted send activity were recorded.
