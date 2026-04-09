# AI Reply Assistant Plan

## Current reply workflow

- Lead detail already has a real operator reply surface in `LeadReplyForm`.
- The live send path is already Yelp-thread-first through `POST /api/leads/[leadId]/reply`.
- Operators can still use Yelp masked-email fallback when Yelp thread delivery is unavailable.
- Operators can mark a lead as read and mark it as replied after a real off-thread phone or email follow-up.
- Lead detail already separates:
  - Yelp-native thread events
  - local reply and delivery actions
  - partner lifecycle statuses
  - automation history

## Where AI can safely assist

- AI should help only at the drafting stage inside the existing reply composer.
- AI should never send directly.
- AI should never create a new delivery channel.
- The safe operator flow is:
  1. operator opens lead detail
  2. operator requests an AI draft
  3. AI returns one to three short draft suggestions
  4. operator chooses or edits a suggestion
  5. operator sends through the existing Yelp-thread or masked-email reply path

## Safe context to pass into generation

- Lead reference and Yelp business context already stored in the console.
- Recent Yelp thread events, limited to the newest customer-visible messages needed for reply context.
- Known business name and mapped location name when available.
- Known mapped service category or mapped service label when available.
- Reply channel currently selected by the operator.
- Existing automated-template tone guidance only if already enabled and safe to reuse.

## Context that must be excluded

- Raw internal notes that were not meant for customer-facing replies.
- Any generated or inferred pricing.
- Arrival times, technician availability promises, or scheduling guarantees unless explicit approved data exists.
- Services or service areas not already known in the system.
- Legal, compliance, warranty, or policy claims.
- Excessive consumer contact detail beyond the lead context already exposed in-product.

## Approval flow

- Draft generation is review-only.
- Generated drafts remain separate from the live composer until the operator explicitly inserts one.
- The operator can regenerate or discard drafts.
- The final sent message still goes through the current reply form and existing Yelp-thread-first send workflow.

## Guardrails and fallback behavior

- Use a server-only draft service with structured output.
- Keep output short, operational, and Yelp-thread-appropriate.
- Add prompt rules that forbid:
  - pricing quotes
  - time guarantees
  - invented service coverage
  - legal/compliance claims
  - long salesy responses
- Add post-generation validation to flag or block drafts that still contain risky content patterns.
- If context is too thin, return a generic but safe request-for-details draft or a `needs_human_reply` warning.
- If AI generation fails or AI is not configured, the operator keeps the normal manual reply workflow with no loss of functionality.

## Operator UX changes

- Add a compact `Generate draft` control inside the existing reply card.
- Show one to three short suggestions directly above the reply textarea.
- Each suggestion should show:
  - draft body
  - optional subject for masked-email fallback only
  - any warning labels
- Add actions:
  - `Use draft`
  - `Regenerate`
  - `Discard`
- Keep a short note that AI suggestions must be reviewed before sending.

## Observability and audit

- Record audit events for:
  - draft generated
  - draft generation failed
  - draft inserted into the composer
  - draft discarded
  - guardrail warning or block
- Do not build a separate AI analytics dashboard yet.

## Manual QA strategy

1. Open a lead with real Yelp thread history and confirm manual reply still works without AI.
2. Generate a Yelp-thread draft and confirm the suggestion is short, relevant, and not auto-sent.
3. Insert a draft into the composer, edit it, and send it through the existing Yelp thread flow.
4. Switch to masked-email fallback and confirm AI can still produce a safe subject/body pair when email is the selected channel.
5. Regenerate and discard drafts, then verify audit history records those actions.
6. Test a thin-context lead and confirm the result stays generic and safe.
7. Test guardrail-sensitive prompts or lead text mentioning price or urgency and confirm the assistant warns instead of making risky promises.
