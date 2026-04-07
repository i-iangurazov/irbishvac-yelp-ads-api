# Leads Page Clarity Audit

## Current implementation snapshot

The current Leads route is rendered in `app/(console)/leads/page.tsx` and shaped by `getLeadsIndex` in `features/leads/service.ts`.

The page currently combines four different concerns at once:

- Yelp lead import status
- autoresponder summary
- internal outcome coverage
- the actual lead queue

That makes the queue feel like one section among many instead of the primary operator surface.

## What each current count means

The current top KPI row is built from `overview.summary` in `getLeadsIndex`.

- `Visible leads`
  - Current meaning: `rows.length`
  - `rows` is the full array returned by `listLeadRecords(...)`, then optionally filtered in memory by `filters.status`
  - Practical meaning: all locally stored leads matching the current page filters
  - Problem: the label is vague and sounds like a viewport/UI count rather than a filtered dataset count

- `Mapped`
  - Current meaning: locally stored filtered leads whose mapping state is `MATCHED` or `MANUAL_OVERRIDE`
  - This is understandable, but only in relation to the filtered subset, not to all synced leads

- `Unresolved`
  - Current meaning: locally stored filtered leads whose mapping state is `UNRESOLVED`
  - This is operator-useful

- `CRM issues`
  - Current meaning: locally stored filtered leads whose derived CRM health is `FAILED`, `CONFLICT`, `ERROR`, or `STALE`
  - This is useful, but the label depends on the operator understanding internal CRM health semantics

- `Failed deliveries`
  - Current meaning: `failedDeliveries.length`
  - This is not scoped to the filtered leads table; it is a separate recent webhook failure list
  - Problem: it sits in the same KPI row as filtered lead counts, so the scope is inconsistent

## Why only 20 leads are shown right now

The current manual Yelp import workflow in `syncBusinessLeadsWorkflow` is hard-coded to request:

- `limit: 20` in the sync run request payload
- `client.getBusinessLeadIds(..., { limit: 20 })`

This means the manual import only asks Yelp for the first page of up to 20 lead IDs.

The Leads page itself does **not** apply its own `take: 20` limit.

`listLeadRecords` uses `findMany` with filters and ordering, but no pagination or result cap. So the page shows all locally stored leads that match the filters.

## What “20 leads” actually means in the current UI

If the console shows 20 leads today, that usually means:

- the latest manual Yelp import pulled the first Yelp page of 20 lead IDs
- those 20 were normalized and stored locally
- the leads page is now showing all locally stored leads matching the current filters

It does **not** mean:

- 20 visible rows because of UI pagination
- 20 rows because the page itself only shows the first 20
- 20 rows because the table has its own internal page size

It is a Yelp import-page limit leaking into the product without clear explanation.

## Whether the current labels are misleading

Yes.

- `Visible leads` is the main problem. It sounds like a UI viewport count, not a filtered dataset count.
- The page never clearly says whether the queue is all synced leads or only the latest Yelp import page.
- The latest import summary says `Returned X Yelp lead IDs`, but it does not clearly connect that number to the current table.
- `Failed deliveries` looks like it belongs to the filtered lead queue, but it is actually a separate recent-failure summary.

## Low-value helper text and noise

The page currently includes several text blocks that are individually true but collectively noisy.

Low-value or over-prominent items:

- the PageHeader description
- the descriptive paragraph inside the Yelp import card
- the read-only permission paragraph inside the Yelp import card
- the descriptive paragraph inside the autoresponder card
- the extra explanatory box inside the autoresponder card
- the source-boundary banner with four badges and a full sentence
- the internal outcome coverage card description
- the queue description that restates multiple concepts again

These are not all wrong. The issue is volume and repetition.

## Useful cards vs unnecessary cards

Useful:

- a compact import action area
- a compact KPI row for queue health
- the lead queue itself
- a small import-status note if the latest import only fetched the first Yelp page

Unnecessary or too prominent:

- the autoresponder card as a top-level peer of import and queue
- the internal outcome coverage card above the table
- the large source-boundary banner above the table
- the recent delivery failures card if it competes directly with the main table

These are secondary concerns. They should not dominate the page.

## What causes the horizontal table scroll

The table currently forces width growth in two ways:

1. It includes too many top-level columns:
   - Lead
   - Business
   - Created
   - Latest activity
   - Yelp state
   - CRM mapping
   - Internal status
   - First response
   - Sync

2. It sets explicit large minimum widths on most columns, including:
   - `min-w-[16rem]`
   - `min-w-[15rem]`
   - multiple `min-w-[13rem]`
   - `min-w-[14rem]`
   - plus table-level `min-w-[1320px]`

This guarantees a wide spreadsheet layout even before the actual content is rendered.

## What the operator currently cannot understand quickly

An operator currently cannot answer these quickly:

- Is this the total queue or just the latest imported page?
- Why am I seeing 20 rows?
- How many leads exist in the system overall?
- How many match my filters?
- Which rows actually need attention right now?
- Which statuses are primary versus secondary?

The row design also spreads state across too many columns, so the operator must scan horizontally to understand one lead.

## Proposed simplification plan

1. Clarify count semantics explicitly.
   - Show total synced leads, filtered leads, and latest import-page count separately.
   - Make it explicit that the current manual Yelp import requests only the first page of 20 lead IDs.

2. Make one compact top action area.
   - Keep import action and latest import status together.
   - Demote autoresponder to a compact link or inline status.

3. Reduce KPI count to the minimum useful row.
   - total synced leads
   - matching current filters
   - needs attention
   - import or intake failures

4. Make the queue visually dominant.
   - place the table immediately after the compact summary and filters
   - move secondary information below the table

5. Remove width-heavy columns.
   - merge business and source context into the lead cell or a compact secondary line
   - merge CRM mapping, internal status, and sync health into a single status stack
   - demote automation from its own top-level column unless it signals attention

6. Replace broad explanatory text with short operator labels.
   - brief note for latest import page limit
   - brief note when filters are active
   - brief empty state

7. Keep source boundaries honest, but lighter.
   - use concise labels like `Yelp`, `Internal`, `Automation`, `Sync`
   - keep detailed explanations on lead detail, not on the queue page
