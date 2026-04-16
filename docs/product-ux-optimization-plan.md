# Product UX Optimization Plan

## Leads

Primary job:
- Triage the live lead queue quickly.
- Understand volume, current slice, attention load, and next action.

What distracts from that job:
- Historical import sits too high and too large relative to the queue.
- Business split, filters, stats, and queue meta are spread across too many separate surfaces.
- The queue header repeats information already shown above it.

Where hierarchy is weak:
- Stats, import controls, business scope, filters, and queue all compete as primary.
- The real work surface, the lead list, starts too late on the page.

Where card overuse exists:
- Historical import card.
- Stats card.
- Business split card.
- Queue card.
- The filters form also visually behaves like another card.

Where forms are poorly structured:
- Filters are dense but visually float as their own full panel instead of a compact control strip.
- Backfill is useful, but its form reads more important than it is.

Where copy is too verbose or repetitive:
- Queue summary and page summary repeat counts already present in the stats strip.
- Historical import explanation is longer than needed.
- Several helper lines restate obvious page behavior.

Where tables/lists are hard to scan:
- The lead row stacks too many small labels and helper lines.
- Timeline cells use repeated micro-headings.
- State and attention columns carry too many competing cues.

Where empty states are too large or noisy:
- Queue empty state still consumes more space than needed for a filter miss.

Primary / secondary / tertiary:
- Primary: lead queue.
- Secondary: filters and business scope.
- Tertiary: historical import utility and supporting status context.

Proposed direction:
- Collapse business scope and filters into one calmer control surface.
- Keep one compact stats strip.
- Demote historical import into a utility panel.
- Tighten queue meta into one concise header line plus a small badge group.
- Reduce row metadata and emphasize customer, business, status, and attention.

## Lead Detail

Primary job:
- Reply confidently in the Yelp thread.
- Understand whether the lead needs human action or partner-ops cleanup.

What distracts from that job:
- The top summary area still behaves like a dashboard, not a reply workspace.
- Too many badges sit in the page header.
- Technical details and partner operations remain visually heavy.

Where hierarchy is weak:
- Reply composer, AI summary, operations, automation history, and raw debugging all feel similarly weighted.
- The page starts with status density instead of a clear “what should I do now” view.

Where card overuse exists:
- Summary card.
- Conversation card.
- Partner operations card.
- Technical details card.
- Reply card.
- AI summary card.
- Operations card.

Where forms are poorly structured:
- The right rail splits reply, AI summary, and operations into separate heavy cards.
- Mapping/lifecycle forms are correct functionally but still framed too prominently for occasional use.

Where copy is too verbose or repetitive:
- Multiple sections restate source-boundary or operator-review logic.
- Several descriptions explain what the operator already understands from the section title.

Where tables/lists are hard to scan:
- Automation history and message history are readable but visually repetitive.
- Technical detail sections still create long vertical stacks of bordered blocks.

Where empty states are too large or noisy:
- Thread, message, automation, and technical empty states all occupy similar large panels.

Primary / secondary / tertiary:
- Primary: reply and immediate lead health.
- Secondary: conversation history, automation context, and lead-level issues.
- Tertiary: partner operations and technical/debug evidence.

Proposed direction:
- Make the header simpler and move state context into a calmer lead overview block.
- Make the right rail clearly reply-first.
- Merge or demote secondary operational context.
- Keep technical detail collapsed and visibly lower-priority.
- Reduce micro-card repetition inside history tabs.

## Autoresponder

Primary job:
- Configure safe live automation and understand whether it is healthy.

What distracts from that job:
- Overview, health, rollout, review operations, business status, overrides, templates, rules, and editors all compete.
- The page still reads as a long stack of admin modules.

Where hierarchy is weak:
- No single “control center” layer exists; everything looks equally important.
- Editors and lists are often peers instead of the editor being subordinate to the list or vice versa.

Where card overuse exists:
- Nearly every section is its own full card, often with internal mini-panels.
- Conversation rollout metrics and health metrics both use card-heavy framing.

Where forms are poorly structured:
- Tenant defaults are still split into multiple bordered groups.
- Template and rule editors are functional but still heavy and overly narrated.
- Business override is much better than before, but the page around it still feels segmented.

Where copy is too verbose or repetitive:
- Policy and safety language repeats across overview, health, settings, and form sections.
- Multiple empty states restate obvious “create one first” logic.

Where tables/lists are hard to scan:
- Business delivery status is useful but wide and visually loud.
- Overrides, templates, and rules all use equally heavy table treatments.

Where empty states are too large or noisy:
- Empty table states still consume full card areas even when they are only placeholders.

Primary / secondary / tertiary:
- Primary: tenant defaults and active business behavior.
- Secondary: overrides, templates, and rules.
- Tertiary: health metrics, rollout monitoring, and review queue.

Proposed direction:
- Turn the top into one concise control and health layer.
- Stack the editable sections vertically in a consistent list-then-editor pattern.
- Move rollout/review operations lower and present them more compactly.
- Reduce table chrome and shorten repeated copy.

## Audit / Issue Queue

Primary job:
- Work the operator queue.

What distracts from that job:
- Pilot monitoring appears before the queue and visually competes with it.
- Recent events and sync logs take too much narrative space.

Where hierarchy is weak:
- Audit trail and operator queue are presented almost equally, even though queue resolution is the main task.

Where card overuse exists:
- Summary metrics as cards.
- Pilot monitoring as a large card.
- Operator queue card.
- Recent events card.
- Sync log card.

Where forms are poorly structured:
- Filters are clear functionally, but the form shell is large and over-framed.

Where copy is too verbose or repetitive:
- Several sections explain “operator queue” behavior more than needed.

Where tables/lists are hard to scan:
- Bulk actions are useful but visually become another large panel above the queue.
- Queue rows can still feel dense because all metadata is rendered at the same visual weight.

Where empty states are too large or noisy:
- Queue/pilot empty states still read like full-page placeholders.

Primary / secondary / tertiary:
- Primary: open operator queue.
- Secondary: compact workload and pilot risk summary.
- Tertiary: recent events and sync history.

Proposed direction:
- Put the queue first.
- Demote pilot monitoring into a compact operational summary block.
- Compress filters.
- Keep audit trail lower and lighter.

## Reporting

Primary job:
- Request reporting data and manage recurring delivery safely.

What distracts from that job:
- Internal conversion foundation is visually larger than it needs to be.
- Top badges and metrics add too much preamble before action surfaces.
- Request form and schedule management both behave like first-class primaries at once.

Where hierarchy is weak:
- Report request, schedule management, delivery health, internal conversion, and saved runs all compete.

Where card overuse exists:
- Top metric cards.
- Conversion foundation card with many mini-cards.
- Request form card.
- Schedule card.
- Schedule editor card.
- Recent runs card.
- Saved runs card.

Where forms are poorly structured:
- Report request form is clear but visually bulky for a straightforward action.
- Schedule form is comprehensive but still card-heavy and verbose.

Where copy is too verbose or repetitive:
- Multiple sections restate that Yelp reporting is delayed batch data.
- Delivery explanations are longer than needed once the structure is clearer.

Where tables/lists are hard to scan:
- Delivery runs carry many columns and statuses at similar weight.
- Schedule table is readable but visually busy.

Where empty states are too large or noisy:
- Empty schedule and delivery states still occupy too much vertical space.

Primary / secondary / tertiary:
- Primary: request report and manage recurring schedules.
- Secondary: delivery health and recent runs.
- Tertiary: internal conversion foundation and saved batch history.

Proposed direction:
- Make request/reporting controls more immediate.
- Compress internal conversion into a calmer supporting section.
- Keep recurring schedules central.
- Tighten table density and delivery-state copy.

## Integrations

Primary job:
- Keep ServiceTitan connected, mapped, and healthy.

What distracts from that job:
- Setup, sync controls, mapping tables, and recent issues all compete equally.
- The page opens with multiple cards before the operator reaches the actual connector controls.

Where hierarchy is weak:
- Status summary, connector form, sync controls, mappings, and issue review are too evenly weighted.

Where card overuse exists:
- Four top cards.
- Connector form card.
- Sync controls card with multiple nested boxes.
- Multiple mapping tables each with their own card.
- Open issues and sync history cards.

Where forms are poorly structured:
- Connector form is workable but still more verbose than needed.
- Sync controls contain too many explanatory containers.

Where copy is too verbose or repetitive:
- Several descriptions restate source boundaries and non-destructive behavior.

Where tables/lists are hard to scan:
- Mapping tables are operationally useful but visually broad and repeated.

Where empty states are too large or noisy:
- Mapping and sync-history empty states are still full-card placeholders.

Primary / secondary / tertiary:
- Primary: connector status and sync controls.
- Secondary: business/location/category mapping.
- Tertiary: issue and sync history.

Proposed direction:
- Replace the heavy top card stack with a tighter operational summary.
- Keep connector form first.
- Demote issue/sync history lower.
- Reduce explanatory noise in sync and mapping sections.

## First implementation priorities

1. Flatten page hierarchy on Leads, Lead detail, Autoresponder, Audit, and Reporting.
2. Reduce shared card and empty-state noise so the whole product feels calmer.
3. Refactor the heaviest forms so they read top-to-bottom without mini-panel overload.
4. Tighten table metadata and repeated helper copy.
5. Align headers, stat strips, section titles, and secondary-state behavior across pages.

## Manual QA Strategy

1. Load each target page with real seeded data and confirm the first visible action is obvious within one screen.
2. Verify page headers, stats, filters, and section titles feel consistent across Leads, Audit, Reporting, Autoresponder, and Integrations.
3. Check empty states with zero-data and filtered-empty scenarios.
4. Exercise Autoresponder tenant settings, business override, template, and rule flows top-to-bottom.
5. Exercise Reporting request and schedule create/edit flows.
6. Exercise Integrations connector save/test and mapping tables.
7. Verify list density and row scanability on Leads, Audit, Reporting, and Autoresponder tables.
8. Run lint, typecheck, tests, and build after the UI pass to ensure no workflow regressed.
