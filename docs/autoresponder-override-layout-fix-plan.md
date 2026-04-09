## What is broken in the current layout

- The override editor sits in a narrow side column next to the overrides list.
- Inside that narrow column, the form is split again into two bordered panels, which creates a cramped double-compression effect.
- Toggles, labels, and dependent inputs are stacked into small bordered blocks that feel more like micro-cards than one coherent form.
- The result is too much vertical fragmentation and not enough readable width.
- The override area feels awkward to scan and harder to complete than it should be for a routine admin task.

## What is causing the compression

- The page layout uses a side-by-side grid for the overrides list and the override editor.
- The override editor then uses another two-column grid for its main sections.
- Within those sections, more nested bordered containers are used for toggles and dependent inputs.
- That creates:
  - narrow columns
  - too many borders
  - helper text wrapping too early
  - a “card-inside-card-inside-column” feel

## How the new layout will be structured

- The business overrides area will stop forcing the editor into a narrow side column.
- The overrides list will stay above, and the editor will move below it at full usable width.
- The form itself will be rebuilt as one clear top-to-bottom editor with section breaks:
  1. Scope
  2. Delivery
  3. AI assist
  4. Follow-ups
  5. Actions
- Two-column layout will be used only where the pairing is natural and the fields still have enough width.
- Toggle rows and dependent inputs will be grouped together, not split across tiny panels.

## What sections will move or collapse

- The page-level `Business overrides` list and the override editor will no longer compete side-by-side on wide screens.
- The form’s current two-panel middle area will collapse into broader sequential sections.
- Nested mini-panels for toggle states will be reduced.
- The empty-state treatment for the overrides list will become smaller and more compact.

## Why the new layout is better

- It gives the most important editor more horizontal room.
- It makes the form readable top-to-bottom instead of forcing the user to zig-zag between narrow panels.
- It reduces visual fragmentation and border noise.
- It makes the override editor feel like one intentional configuration surface instead of several stitched-together mini-cards.
- It better fits the actual job: choose a business, decide delivery mode, decide AI assist mode, decide follow-ups, save.
