# AI Lead Summary Summary

## What AI summary assistance is now live

Lead detail now includes a compact `AI lead summary` panel in review mode.

Operators can:

- generate a concise AI-assisted summary on demand
- regenerate the summary when thread or lifecycle context changes
- dismiss the current summary

The generated summary covers only low-risk operator guidance:

- customer intent summary
- service and context summary
- Yelp thread status summary
- partner lifecycle snapshot
- sync or issue note when relevant
- missing-information checklist
- suggested next steps

The summary is clearly marked as AI-generated assistance and remains separate from Yelp-native records, partner lifecycle records, and sent messages.

## What remains human-only

- deciding what the lead actually means operationally
- sending any Yelp-thread reply
- changing CRM or partner lifecycle state
- resolving issue queue items
- acting on suggested next steps

This feature does not auto-send, auto-resolve, auto-map, or auto-update any source-of-truth record.

## Guardrails

The AI summary flow is constrained to safe, already-visible lead context:

- Yelp lead reference and business context
- mapped location and service label when present
- recent Yelp thread messages
- Yelp read/reply state
- current partner lifecycle status
- mapping state
- partner sync health
- open issue summaries
- recent automation state

It explicitly avoids inventing:

- customer facts
- pricing or quote terms
- technician timing or availability
- booking or job outcomes
- service coverage claims
- legal, warranty, or compliance claims

If risky language is detected, the system falls back to a deterministic safe summary and adds review warnings.

## What remains out of scope

- autonomous reply generation or sending
- persistent AI memory per lead
- AI-based status changes
- AI-based issue resolution
- prompt editing UI
- a standalone AI operations dashboard

## Manual QA steps

1. Open a lead detail page with real Yelp thread content.
2. Confirm the `AI lead summary` card appears in the right column and is labeled as review-only.
3. Click `Generate summary`.
4. Confirm the summary renders separate sections for customer intent, service/context, thread status, partner lifecycle, missing info, and suggested next steps.
5. Confirm the text matches visible system facts and does not mention pricing, availability promises, or invented outcomes.
6. Click `Regenerate` and confirm the summary refreshes without affecting any Yelp-thread or partner lifecycle records.
7. Click `Dismiss` and confirm the panel returns to its pre-generation state.
8. Test a lead with sparse context and confirm warnings or missing-information guidance appear.
9. Review audit history and confirm generate, refresh, dismiss, and failure events are recorded.
10. Confirm that no AI-generated text is shown as a sent Yelp message unless an operator manually uses the separate reply workflow.

## Assumptions and limitations

- AI summary generation is available only when the existing env-backed AI assist path is configured.
- Summary output is ephemeral UI state, not a persisted lead record.
- The feature reuses the current AI assist enablement model instead of introducing a new admin control surface.
- Audit coverage is lightweight and operational, not a full AI analytics layer.
