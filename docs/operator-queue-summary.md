## Operator Queue Summary

### What was implemented

The existing operator issue system was tightened into a more complete operational queue instead of being replaced.

Implemented in this slice:

1. Safe retry coverage now includes:
   - failed Yelp lead intake sync runs
   - failed downstream CRM sync runs
   - existing autoresponder failures
   - existing report delivery failures

2. Queue shaping now exposes retry intent more clearly:
   - retry-ready summary count
   - issue-level retry labels
   - more useful next-step hints in `/audit`

3. Lead workspace integration:
   - lead rows now surface linked open issue counts
   - lead detail now shows linked open operator issues directly

4. Reporting integration:
   - recent recurring delivery runs now link directly to their open queue item when one exists

5. Manual retry actions remain auditable:
   - successful retries write `issue.retry`
   - failed retries also write `issue.retry` with failure context

### Which issue types are truly live

The queue is now operational for these active problem types:

- `LEAD_SYNC_FAILURE`
- `UNMAPPED_LEAD`
- `CRM_SYNC_FAILURE`
- `AUTORESPONDER_FAILURE`
- `REPORT_DELIVERY_FAILURE`
- `MAPPING_CONFLICT`
- `STALE_LEAD`

Retry support is truly live for:

- `LEAD_SYNC_FAILURE`
- `CRM_SYNC_FAILURE`
- `AUTORESPONDER_FAILURE`
- `REPORT_DELIVERY_FAILURE`

Manual resolve / ignore / note workflows remain live for all issue types.

### What operators can do now

Operators can now:

- open one central queue in `/audit`
- filter by issue type, client, location, severity, status, and age
- see which issues are retryable now
- retry failed lead intake from stored webhook/backfill data
- retry downstream partner sync from stored sync request data
- retry autoresponder and report delivery failures
- jump from a lead or report run into the linked issue
- resolve or ignore issues with a reason
- add an internal note
- review audit trail and raw issue context on the detail page

### What remains intentionally out of scope

This slice does not add:

- a separate incident-management product
- threaded collaboration on issues
- bulk queue actions
- automatic escalation workflows
- universal retry for every issue type
- automatic remediation for mapping conflicts or stale leads

Those cases still require operator judgment in the lead workspace or queue detail.

### Assumptions and limitations

1. The queue model did not need schema expansion.
   - The existing `OperatorIssue` model already had enough structure for this slice.

2. Lead sync retry is trustworthy only when persisted source data exists.
   - webhook retries replay saved raw deliveries
   - backfill retries replay saved request data

3. CRM retry depends on stored `requestJson`.
   - mapping and partner lifecycle retries replay the original sync intent
   - unsupported or incomplete stored requests still fail safely

4. Lead and reporting pages still do not replace `/audit`.
   - they now link into the queue rather than becoming their own issue systems

5. Some issues are still intentionally non-retryable.
   - unmapped leads
   - mapping conflicts
   - stale leads

### Exact manual QA steps

1. Open `/audit`
   - confirm the top summary includes open issues, high severity, retry-ready, and unmapped leads
   - confirm rows show a useful next step

2. Create or seed a failed lead sync run
   - confirm a `Lead sync failure` issue appears
   - open the issue
   - confirm retry is available
   - retry it and confirm audit entries update

3. Create or seed a failed CRM sync run
   - confirm a `CRM sync failure` issue appears
   - retry it from the issue detail page
   - confirm the issue either clears or stays open with updated detection time

4. Open `/leads`
   - confirm leads with open queue items show issue counts in the attention column

5. Open `/leads/[leadId]`
   - confirm the lead detail shows linked open operator issues
   - confirm links open the queue detail page

6. Open `/reporting`
   - confirm failed recent delivery runs show an `Open issue` link when the queue has a matching active failure

7. Resolve or ignore an issue manually
   - confirm `issue.resolve` or `issue.ignore` audit events are recorded
   - confirm the queue state updates correctly

8. Add an internal note on an issue
   - confirm the note appears in the issue action log through audit history
