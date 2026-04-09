## Leads

### Primary job
Help an operator scan the current queue, understand which slice they are looking at, and move quickly into the leads that need attention.

### What currently distracts from that job
- The historical import area is still too visually strong for a secondary utility.
- Queue meaning is repeated in the page header, metric strip, queue summary line, queue meta line, and badges.
- The queue header spends too much space narrating context instead of pushing the table forward.
- The page still reads like a combination of operations console and support notes.

### Redundant or over-prominent sections
- The historical import card and the “latest historical import” panel together take too much top-of-page weight.
- The three queue badges (`Yelp`, `Partner lifecycle`, `Local sync`) repeat information the page already communicates through the table and labels.
- The extra footer link to review failures in `/audit` is useful, but too detached from the actual queue state.

### Repetitive copy
- Lead count semantics are explained in multiple places.
- Historical backfill status is explained both in the top card and again in queue meta.
- Attention state is described in the metric strip and again in queue helper lines.

### Card overuse
- Leads currently uses a large import card, three metric cards, the filter card, and the queue card before the user can really work the list.
- The result is too many equally weighted surfaces before the main queue.

### Weak hierarchy
- The top of the page still gives too much weight to import support tooling.
- The queue is not visually dominant soon enough.
- Metrics, filters, and queue context are individually valid, but they are not compressed enough into one clear operator flow.

### What should be primary / secondary / tertiary
- Primary: queue counts, filters, lead queue.
- Secondary: historical import action and latest import outcome.
- Tertiary: deeper historical import notes and secondary failure links.

### Layout changes needed
- Compress historical import into a lighter utility surface.
- Tighten the metric strip so it reads as one compact summary instead of three explanatory mini-cards.
- Remove duplicate queue metadata and badges.
- Keep pagination and count truth, but express it once in the queue header and once in the pager.

### What should be reduced, merged, or demoted
- Merge the historical import description and latest import state into a tighter two-column strip.
- Demote the extra queue badges.
- Remove the separate bottom failure CTA and keep issue emphasis closer to the queue itself.
- Reduce helper copy around the queue and let labels do more of the work.

## Autoresponder

### Primary job
Let an admin or operator understand whether autoresponder is live, for which businesses, with which rules and templates, and whether anything needs intervention.

### What currently distracts from that job
- The page starts with four metric cards, then another settings card, then an operating policy card, then AI, activity, and failures. Too many concepts hit at once.
- “Policy” language is repeated across settings, overview, AI, templates, and rules.
- The page feels like a long stack of admin configuration blocks rather than one coherent module.

### Redundant or over-prominent sections
- The top metric row duplicates information already shown in the overview/settings surfaces.
- The separate “Operating policy” card repeats thread-first, fallback, and follow-up details that already exist in configuration.
- The AI card is correct functionally, but too prominent for a supporting feature.
- Activity and linked failures are useful, but they do not need equal visual weight with core configuration.

### Repetitive copy
- Yelp-thread-first behavior is restated in several cards and forms.
- AI review-mode constraints are restated in multiple places.
- Follow-up policy is described in the overview card, settings form, rule table, and rule form.
- Template and rule helper text explains guardrails repeatedly instead of relying on structure and labels.

### Card overuse
- Almost every logical subsection is a full card, and many of those cards contain more bordered boxes inside them.
- Business overrides, templates, and rules each create a table card plus a full-height form card, which makes the page feel like three parallel admin builders.

### Weak hierarchy
- Overview, configuration, content, rules, monitoring, and AI are too close in visual weight.
- The page does not clearly answer “is it live, where is it scoped, what is actually active, and are there failures?” before dropping the user into long forms.

### What should be primary / secondary / tertiary
- Primary: live status, tenant configuration, business scope, templates and rules that are actually active.
- Secondary: business overrides editing, AI assist mode, monitoring.
- Tertiary: detailed policy narration and empty-state explanation.

### Layout changes needed
- Replace the heavy metric-card start with a tighter overview band.
- Fold operating policy into the overview instead of keeping a separate large card.
- Separate the page into clearer zones: overview, tenant settings, scoped overrides, content, rules, monitoring.
- Keep activity and failures visible but lighter and more compact.

### What should be reduced, merged, or demoted
- Merge “Operating mode” and “Operating policy” into one compact overview surface.
- Demote AI assist into a smaller supporting panel.
- Shorten empty states for overrides, templates, rules, activity, and failures.
- Tighten form wrappers and reduce nested bordered sections.
- Make dependent settings appear only when enabled or make them visually subordinate when disabled.
