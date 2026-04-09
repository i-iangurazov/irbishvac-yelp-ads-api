**Lead Detail UX Audit**

1. Primary job

The page should help an operator answer four questions quickly:
- what this lead is about
- whether it needs a reply now
- what has already happened in the Yelp thread
- whether any internal mapping, lifecycle, or automation issue needs intervention

2. What is broken now

- The page header uses the raw external lead ID as the main title, which is operationally weak and visually cold.
- The first card tries to carry too many jobs at once: identity, state, sync health, automation state, reply channel, intake metadata, and lifecycle context.
- Replying is the primary action, but the reply composer is visually buried below AI summary, issues, and several diagnostic surfaces.
- Yelp thread events, reply action history, automation history, webhook deliveries, CRM mapping, lifecycle update, and source-boundary notes all compete with similar card weight.
- The page feels like a stack of internal tools instead of one operator flow.

3. Redundant or overly prominent sections

- The top badge row in the page header repeats concepts already explained by the page sections.
- "Automation note", "Automation scope", and "Next follow-up due" sit inside the already overloaded summary card instead of a more focused automation block.
- "Webhook deliveries" is useful but too prominent for most operator sessions.
- "Source boundaries" is honest, but it is educational copy taking first-class space on an already dense page.
- "Reply and message actions" and "Automation history" should not both sit at full visual weight above CRM controls.

4. Weak hierarchy

Primary:
- lead identity and current state
- reply action
- Yelp thread context

Secondary:
- AI summary assist
- open issues
- automation status
- partner lifecycle status

Tertiary:
- webhook deliveries
- local message action logs
- raw automation history
- source-boundary explanation

5. Layout changes needed

- Replace the overloaded top summary with a cleaner hero summary plus a compact state grid.
- Make the reply composer the first action in the right rail.
- Keep AI summary near reply, but below it.
- Merge diagnostic history into a smaller number of scan-friendly sections.
- Demote technical evidence into tabs or accordions instead of open full-width cards.
- Combine CRM mapping and lifecycle update into one partner operations section.

6. Content to reduce or demote

- remove the header badge strip
- reduce explanatory descriptions on most cards
- move source-boundary explanation into a compact accordion
- move webhook deliveries into a collapsed technical section
- condense the summary facts to fields operators actually check first

7. Product-quality target

The improved page should feel like:
- one clear lead workspace
- reply-first
- timeline-driven
- operationally trustworthy

It should not feel like:
- a report dump
- a debugging screen
- a stack of unrelated admin cards
