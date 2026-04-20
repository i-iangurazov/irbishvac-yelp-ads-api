# Leads + Autoresponder Hardening Summary

## What was confusing before

- The Leads page mixed historical import notes, queue counts, intake failures, and helper copy too aggressively.
- It was easy to misread `20` as a UI page size, a database limit, or the total number of available Yelp leads.
- The queue itself had no local pagination, but that truth was not stated clearly.
- Autoresponder behavior was still effectively tenant-wide, even when operators needed to test a specific Yelp business safely.
- AI model choice for reply assistance was env-hidden and defaulted to a more expensive model than needed for cheap testing.
- Template and rule management did not make business scope or safe Yelp-thread message quality obvious enough.

## Why only 20 leads were shown before

- The `20` came from the historical Yelp lead import limit in `features/leads/service.ts`.
- `YELP_LEAD_IMPORT_PAGE_SIZE` is `20`.
- The manual historical import requests only the first Yelp page of lead IDs for a business.
- The Leads queue itself was not locally paginated.
- So when operators saw only 20 synced leads, that usually meant only the first Yelp historical page had been imported so far, not that the queue was hiding additional local rows.

## What changed in lead count and pagination clarity

- The Leads page now separates:
  - total synced leads
  - leads matching current filters
  - rows shown in the queue
  - latest historical import scope
- The queue summary now states directly when the queue is not locally paginated.
- The historical import panel now states directly when only the first Yelp page of 20 lead IDs has been imported.
- The queue header repeats the important distinction:
  - the queue is not capped at 20 locally
  - the historical import may still only cover the first Yelp page

## What clutter and text were removed

- The Leads page now uses one compact historical import area instead of multiple competing explanation blocks.
- The bottom “recent intake failures” card was removed from the main workflow and replaced with a cleaner link back to the issue queue.
- The queue remains the dominant surface.
- Helper text was shortened on both Leads and Autoresponder so the pages read like operating tools instead of guided walkthroughs.

## How business-scoped autoresponder now works

- Tenant-wide defaults still exist and remain the fallback.
- A new business-specific override can now be created per saved Yelp business.
- Each override controls:
  - enabled or disabled
  - primary channel
  - masked-email fallback policy
  - AI draft assist enabled or disabled
  - approved AI model choice
- If no override exists for a Yelp business, the tenant default applies.
- Templates can now be global or scoped to one Yelp business.
- Rules can now be global or scoped to one Yelp business, and a rule cannot safely attach a template from a different business scope.

## How AI model selection now works

- AI model selection is now visible in the Autoresponder module instead of being env-hidden only.
- The approved model list is intentionally small:
  - `gpt-5-nano` — cheapest / test
  - `gpt-5-mini` — balanced
  - `gpt-5.2` — higher quality
- The effective model is resolved from:
  1. business override, if present
  2. tenant default autoresponder setting
  3. approved env fallback
  4. `gpt-5-nano`
- AI drafting and summaries remain review-only and never auto-send.

## Recommended low-cost testing setup

- Use `gpt-5-nano` for the first real test business.
- Keep AI draft assist enabled only where operators are actively testing.
- Keep Yelp thread as the primary response path.
- Keep masked-email fallback enabled only when SMTP is configured and you actually want that fallback available.
- Use the new business override flow to isolate the test Yelp business instead of changing tenant-wide defaults.

## Autoresponder quality improvements

- Automated disclosure now follows the Yelp-safe pattern near the top of the message:
  - `Irbishvac automated message from [Business Name] via Yelp - a team member may follow up with more details.`
- Starter template types now cover:
  - acknowledgment
  - request for missing details
  - after-hours acknowledgment
  - cannot estimate yet
  - 24-hour follow-up copy
  - following-week follow-up copy
- The “cannot estimate yet” pattern now explicitly:
  1. avoids an exact quote
  2. asks for the missing details
  3. offers the next step inside the Yelp thread

## What remains intentionally out of scope

- Full local pagination for the Leads queue
- Multi-page Yelp historical import orchestration beyond the current first-page support tool
- Autonomous AI sending
- Scheduled 24-hour or following-week autoresponder follow-up automation
- Multi-business campaign-style marketing automation
- Broad model-lab experimentation UI

## Manual QA steps

1. Open `/leads`.
2. Confirm the queue summary distinguishes synced leads, matching leads, and shown rows.
3. If the latest historical import has `hasMore = true`, confirm the page clearly says only the first Yelp page of 20 lead IDs has been imported.
4. Confirm the queue remains the visual center and no bottom failure card competes with it.
5. Open `/autoresponder`.
6. Confirm tenant-wide settings now include:
   - enabled or disabled
   - default channel
   - masked-email fallback policy
   - AI assist toggle
   - AI model selector
7. Create a business override for a test Yelp business and verify it appears in the Business overrides table.
8. Edit that override and confirm the saved model and fallback policy remain scoped to that business.
9. Create or edit a template and verify business scope plus template type are visible and savable.
10. Load the `Cannot estimate yet` starter and confirm the copy stays short, clearly automated, and asks for missing details in-thread.
11. Create or edit a rule scoped to the same test Yelp business and confirm business scope is visible.
12. Verify a mismatched business-scoped template cannot be saved onto a different business rule.
13. Open a lead from the test business and verify AI assist state reflects the scoped business configuration.
