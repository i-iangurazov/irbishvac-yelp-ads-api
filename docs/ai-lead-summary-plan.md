# AI Lead Summary Plan

## What operators already see today

The lead detail page already exposes the raw operating context an operator needs:

- Yelp-native lead metadata
- Yelp thread timeline
- reply and message actions
- partner lifecycle timeline
- CRM mapping state
- open operational issues
- webhook and sync diagnostics
- first-response automation history

The page is operationally honest, but it still requires the operator to mentally combine several sections before they can answer a simple question like:

- What does this customer want?
- What has already happened?
- What is missing?
- What should I do next?

## Where cognitive overload still exists

The current page is accurate but dense.

The main overload points are:

- customer intent is buried inside the Yelp event timeline
- mapping, lifecycle, automation, and issue state are split across multiple cards
- the operator has to translate several raw statuses into an immediate next step
- there is no concise synthesized snapshot for triage

## Safe context to pass into AI generation

Use only existing source-of-truth fields that are already visible or derived safely from the current lead record:

- Yelp lead reference and business name
- mapped location or business context if present
- mapped service category if present
- recent Yelp thread messages
- Yelp reply/read state
- created and latest-activity timestamps
- current partner lifecycle status
- CRM mapping state
- partner sync health
- open issue summaries
- first-response automation summary

Do not pass hidden credentials, raw provider secrets, or consumer contact fields beyond what is already safely available in the lead context.

## Useful and low-risk outputs

The AI output should stay compact and operational:

- short customer-intent summary
- service/context summary
- thread status summary
- partner lifecycle snapshot
- issue note if there is an active sync or mapping problem
- missing information checklist
- suggested next steps

This should help the operator scan faster, not replace the underlying records.

## What must be excluded

The assistant must not:

- invent customer facts
- invent prices or cost ranges
- invent availability or arrival timing
- invent booking, scheduling, or completion outcomes
- invent services, coverage areas, or compliance claims
- produce long narrative paragraphs

If context is insufficient, the output should explicitly say that human review is needed.

## Approval flow

This is review-only assistance.

- operator requests generation manually
- operator sees AI-generated summary in a distinct panel
- operator decides what to do next
- no sending, no status change, no automatic action

## Guardrails and fallback behavior

- reuse the current OpenAI env-backed review-mode path already used for AI reply drafts
- structured-output response only
- concise prompt with hard negative instructions
- deterministic fallback summary when AI output is risky or context is too thin
- record audit events for generate, refresh, dismiss, and failure

## UI integration plan

Add one compact `AI lead summary` panel near the top of the right column on lead detail.

The panel should:

- stay secondary to source-of-truth records
- clearly say `AI-generated assist`
- expose `Generate`, `Regenerate`, and `Dismiss`
- show short sections for summary, missing info, and next steps

## Manual QA strategy

1. Open a lead with rich Yelp thread context and generate a summary.
2. Confirm the output references only visible system facts.
3. Confirm missing-info items reflect actual gaps such as unmapped service or no recent reply.
4. Regenerate and confirm a refresh event is recorded.
5. Dismiss the summary and confirm a dismiss event is recorded.
6. Test a lead with thin context and confirm the panel warns that human review is needed.
7. Force an AI failure and confirm the route returns an error and the failure is audited.
