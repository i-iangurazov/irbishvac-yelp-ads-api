## What was cluttered before

- Leads gave too much weight to historical import, helper notes, badges, and queue meta before the actual list.
- Autoresponder started with too many equally weighted cards and then repeated policy, AI, and fallback language across several sections.
- Both pages showed valid information, but too much of it was competing at the same level.

## What was reorganized

### Leads
- Historical import was compressed into a lighter utility strip instead of a dominant top story.
- Three separate stat cards were replaced with one tighter summary band.
- Queue context was reduced to one main summary line and one compact meta row.
- The queue remains the main surface, with filters directly above it and less noise before the table.

### Autoresponder
- The page now opens with a compact overview plus a health panel instead of a heavy metric-card row.
- Tenant defaults became the first clear configuration area.
- Business overrides, templates, and rules remain as distinct sections, but the page now treats them as content/configuration zones instead of one long equal-weight card wall.
- Monitoring moved into a lighter right rail: live mode, recent activity, and linked failures.

## What repetition was removed

- Repeated Yelp-thread / fallback / review-mode explanations were reduced across the page header, top overview, and forms.
- The old standalone “Operating policy” card was removed and its useful information was folded into smaller overview surfaces.
- Leads queue badges and duplicate queue-helper lines were reduced.
- Empty states were shortened so they stop reading like placeholder scaffolding.

## How hierarchy improved

- Leads now reads as: title, backfill utility, compact counts, filters, queue.
- Autoresponder now reads as: title, overview, health, tenant defaults, business overrides, templates, rules, monitoring.
- Primary work surfaces are visually clearer:
  - Leads queue
  - Tenant defaults
  - Business overrides
  - Templates
  - Rules
- Supporting context is still present, but it is visually demoted instead of competing.

## What was demoted, merged, or collapsed

- Leads historical import was demoted from a large top card pair into a smaller utility strip.
- Leads summary cards were merged into one compact band.
- Leads queue badges were reduced to only the queue facts that matter now.
- Autoresponder operating policy was merged into overview and live-mode snapshots.
- AI assist was demoted from a large standalone explainer into a smaller supporting surface.
- Empty states for overrides, templates, rules, activity, and failures were reduced in size and copy.
- Follow-up delay inputs now hide cleanly when that cadence is off.

## Remaining UX rough edges

- Autoresponder still has a lot of capability on one page. It is materially calmer now, but templates and rules are still dense because they are real operator controls.
- Leads rows still carry several status chips. That is acceptable operationally, but it is still the densest part of the queue.
- Historical backfill remains visible because it matters operationally; it is lighter now, but not fully hidden.
- Business override editing still sits beside the list instead of using a separate drawer or inline edit pattern.

## Exact manual QA steps

1. Open `/leads`.
2. Confirm the top of the page reads in this order: title, historical import utility, compact counts, filters, queue.
3. Confirm the historical import area no longer dominates the screen and still exposes the backfill action.
4. Confirm the count semantics are still explicit:
   - synced leads
   - current filtered slice
   - rows on the current page
   - current page number and page size
5. Change filters and confirm the queue summary and pager stay truthful and concise.
6. Confirm the queue remains the visual center of the page and no extra bottom helper CTA appears.
7. Open `/autoresponder`.
8. Confirm the page opens with overview and health, not a wall of equal-weight cards.
9. Confirm the section order is clear:
   - tenant defaults
   - business overrides
   - templates
   - rules
   - monitoring
10. Confirm the forms read top-to-bottom and that dependent follow-up delay fields appear only when their cadence is enabled.
11. Confirm AI assist is visible but not visually dominant.
12. Confirm empty states for overrides, templates, rules, activity, and failures are smaller and clearer than before.
13. Save a tenant default change, a business override change, a template, and a rule to confirm functionality still works.
