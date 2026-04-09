## What was broken before

- The override editor was forced into a narrow side column beside the overrides list.
- Inside that narrow column, the form was split into more narrow panels, which made the whole editor feel cramped and awkward.
- Toggles, labels, and dependent inputs were fragmented across too many bordered mini-sections.
- The list empty state also took more attention and space than it needed when no overrides existed yet.

## How the form layout was rebuilt

- The business overrides area now stacks the list and the editor vertically instead of forcing them into a side-by-side split.
- The override editor now uses one broader top-to-bottom form flow:
  1. Scope
  2. Delivery
  3. AI assist
  4. Follow-ups
  5. Actions
- Related controls now stay together in wider rows or sections instead of being split across narrow columns.
- Follow-up delay inputs remain hidden until their cadence is enabled.
- The save action stays clearly at the end of the form.

## What was simplified

- The old narrow two-panel middle layout was removed.
- The number of nested bordered containers was reduced.
- Toggle rows are broader and easier to scan.
- AI assist and follow-up controls now present their dependent fields more naturally.
- The business overrides empty state is now a compact inline message instead of a larger nested empty-state card.

## What page-level layout changes were required

- The `Business overrides` section no longer uses the old side-by-side composition for list and editor.
- The editor now gets the full width of the main content column.
- This was the main structural fix that made the form usable again.

## Remaining rough edges

- The overall Autoresponder page is still a dense operational module, so the override form now feels much better than before but still lives inside a larger settings-heavy screen.
- The form still uses section borders to separate major groups. That is acceptable now, but it could be made even lighter in a future polish pass.
- The list table above the editor is still compact and operational rather than especially spacious.

## Exact manual QA steps

1. Open `/autoresponder`.
2. Scroll to the `Business overrides` section.
3. Confirm the list and the editor are no longer side-by-side in a narrow split.
4. Confirm the editor has enough width to read labels and helper text without awkward wrapping.
5. Confirm the form reads in this order:
   - Yelp business
   - enabled
   - primary channel
   - masked email fallback
   - AI draft assist
   - AI model
   - 24-hour follow-up
   - following-week follow-up
   - save button
6. Toggle AI draft assist on and off and confirm the AI model field appears or demotes cleanly.
7. Toggle each follow-up cadence on and off and confirm the delay input appears or hides cleanly.
8. Confirm the `Yelp business` field is visually the first and most obvious input.
9. Confirm the save action sits clearly at the end of the form.
10. If there are no overrides yet, confirm the list area stays compact and does not waste vertical space.
