# Leads + Autoresponder Hardening Plan

## 1. Current Leads page structure

The current `/leads` page has:

- a page header
- a support backfill card with manual Yelp import controls
- a separate latest-import card
- a four-card KPI row
- a filter panel
- the main lead queue card
- an optional recent intake failures card

The queue itself is already the most useful surface, but the page still spends too much space explaining support import behavior and repeating semantics that should be visible in the counts.

## 2. Current lead pagination / retrieval behavior

There is no local page-based pagination on the Leads page today.

- `getLeadsIndex()` loads all synced leads matching the current filters from Postgres.
- `summary.filteredLeads` and `summary.visibleRows` are both `rows.length`.
- the page does not currently accept a `page` parameter or apply a DB `take/skip`.

That means the Leads page is not showing “page 1 of 20” or any similar local pagination state today.

## 3. Exactly why only 20 leads are shown today

The `20` comes from the manual Yelp support import path, not from the Leads page itself.

- `features/leads/service.ts` defines `YELP_LEAD_IMPORT_PAGE_SIZE = 20`
- `syncBusinessLeadsWorkflow()` calls Yelp `getBusinessLeadIds(..., { limit: 20 })`
- the latest support import summary then reports that first returned Yelp page

So if the operator sees only 20 leads in the queue after using manual import, that generally means:

- only the first Yelp `lead_ids` page has been imported so far
- and webhook-first live intake has not yet added more leads afterward

It is not:

- a UI page size
- a DB query limit in `listLeadRecords()`
- a local table pagination cap

It is a manual Yelp historical import page limit.

## 4. Current “20” source breakdown

The current `20` is:

- Yelp fetch limit: yes
- latest import limit: yes
- UI page size: no
- DB query limit: no
- local pagination: no

## 5. Low-value noise on the current Leads page

The current low-value or repetitive text includes:

- “Support backfill” explanation copy above the import form
- a separate latest-import card that repeats first-page semantics again
- helper text in KPI cards that states obvious things
- queue header copy that repeats source-boundary ideas already shown in badges
- a second “latest import” note under the queue header

The page is honest, but it over-explains.

## 6. Current autoresponder configuration today

Current autoresponder behavior includes:

- tenant-level settings under `LEAD_AUTORESPONDER_SETTING_KEY`
- enabled / disabled
- default channel
- AI assist enabled / disabled
- rule-based selection
- location-scoped rules
- service-scoped rules
- review-only AI drafting
- recent activity and failures on the dedicated module page

Current gaps:

- no Yelp business-specific enable/disable
- no business-specific templates
- no business-specific rules
- AI model selection is env-only via `OPENAI_REPLY_MODEL`
- message templates are still functional but too generic for Yelp RAQ quality

## 7. How business scoping works today

Business scoping does not exist as a first-class autoresponder scope today.

Rules can currently scope by:

- internal location
- service category

This is not enough for the user’s test-business requirement, because Yelp business ownership is not explicitly configurable in the autoresponder workflow.

## 8. How AI model selection works today

AI model selection is not currently practical in-product.

- `features/leads/ai-reply-service.ts` defaults to `gpt-5.2`
- the selected model comes only from env `OPENAI_REPLY_MODEL`
- the autoresponder module only displays the current model label
- there is no admin/operator choice for low-cost testing

This makes testing expensive or opaque depending on env setup.

## 9. What should change first

Priority order:

1. Fix Leads count semantics and import-limit language.
2. Collapse noisy import and queue helper text into a smaller, clearer summary.
3. Tighten the lead table so business / location / service / latest status are faster to scan.
4. Add first-class Yelp business scope to autoresponder settings, templates, and rules.
5. Add a constrained AI model selector with small approved options and a cheap default.
6. Upgrade template quality around:
   - automated disclosure
   - no-estimate-yet replies
   - after-hours
   - follow-up cadence

## 10. Manual QA strategy

Leads:

1. Open `/leads` with no filters.
2. Confirm total synced leads, matching leads, and visible rows are distinct and obvious.
3. Confirm the page explicitly explains whether the current queue reflects all synced leads or only the first imported Yelp page.
4. Run a manual import and confirm the import summary clearly states first-page behavior when Yelp reports more lead IDs.
5. Apply filters and confirm matching/visible counts stay truthful.

Autoresponder:

1. Open `/autoresponder`.
2. Confirm default settings and per-business overrides are clearly distinguished.
3. Create or edit a business-scoped rule/template for a test Yelp business.
4. Confirm fallback behavior is explicit when no business-specific override exists.
5. Confirm AI model selection exposes only a small approved list and defaults to the lowest-cost testing option.
6. Confirm generated/saved templates include a clear automated disclosure and safe no-estimate wording.
7. Confirm follow-up rules, if enabled, stay thread-first and do not imply autonomous human behavior.
