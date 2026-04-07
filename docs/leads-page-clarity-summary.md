# Leads Page Clarity Summary

## What was confusing before

The previous Leads page mixed four different surfaces at the top:

- Yelp import status
- autoresponder summary
- internal outcome coverage
- the actual lead queue

That made the queue feel secondary. The page also used the label `Visible leads`, which did not tell the operator whether the number meant:

- all synced leads
- rows matching the current filters
- rows visible in the viewport
- or the latest Yelp import size

The table then reinforced the confusion by showing a wide spreadsheet-style layout with nine columns and forced horizontal scrolling.

## What changed

The page now follows one clearer sequence:

1. page title
2. one compact Yelp import area
3. one small KPI row
4. filters
5. the lead queue
6. recent intake failures only if failures exist

Top-level clutter was reduced by removing the large autoresponder and internal outcome cards from the main hierarchy. Autoresponder remains available through Settings, but it no longer competes with the queue.

## What “20 leads” actually meant before

It did **not** mean the Leads page was paginated to 20 rows.

It meant the manual Yelp import workflow was hard-coded to request only the first page of Yelp lead IDs with `limit: 20`. The page itself showed all locally stored leads matching the filters.

So if the console showed 20 rows, that usually meant:

- the latest manual Yelp import pulled 20 lead IDs from Yelp
- those 20 were stored locally
- the Leads page then showed all locally synced leads that matched the current filters

## What the UI says now instead

The page now separates these meanings explicitly:

- `Synced leads`: all leads stored in the console
- `Matching filters`: the subset matching the current filters
- the queue header states that all matching leads are shown on the page
- the latest import block states how many Yelp lead IDs were fetched and whether Yelp reported more beyond the first page

When applicable, the page now says the latest import fetched the **first Yelp page** and that Yelp reported more lead IDs beyond that page.

## How top clutter was reduced

Removed or demoted from the top of the page:

- large autoresponder summary card
- large internal outcome coverage card
- broad source-boundary banner
- repeated helper paragraphs
- long queue description text

Kept at the top:

- one import action area
- four compact operational counts
- one filter block

## How table horizontal scroll was improved

The table was reduced from nine top-level columns to five:

- Lead
- Activity
- Yelp
- Internal
- Attention

The row layout now uses stacked secondary text inside cells instead of one column per backend concept. This lets the operator understand:

- who the lead is
- which business it belongs to
- when it came in
- current Yelp state
- internal mapping/lifecycle state
- whether it needs attention

without scanning across a very wide grid.

The forced `min-w-[1320px]` table layout is gone.

## Remaining limitations

- The manual Yelp import still only fetches the first page of lead IDs.
- The page still shows all matching rows on one screen; there is no local pagination yet.
- Some long IDs and timestamps can still wrap on narrower desktop widths, but the main operator workflow no longer depends on sideways table panning.
- Detailed source-boundary explanation still lives more fully on lead detail than on the queue page, by design.
