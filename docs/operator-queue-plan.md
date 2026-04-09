## Operator Queue Plan

### Current issue visibility

The repo already has a real `OperatorIssue` model and `/audit` queue. The current system detects and normalizes these active issue types:

- `LEAD_SYNC_FAILURE`
- `UNMAPPED_LEAD`
- `CRM_SYNC_FAILURE`
- `AUTORESPONDER_FAILURE`
- `REPORT_DELIVERY_FAILURE`
- `MAPPING_CONFLICT`
- `STALE_LEAD`

Current visibility is spread across several surfaces:

- `/audit` shows the central queue and manual issue actions.
- `/leads` shows lead-level attention summaries, but not the linked queue items themselves.
- `/leads/[leadId]` shows local processing and CRM issues, but not the normalized operator issues that already exist.
- `/reporting` shows failed schedule runs, but not the linked issue records or queue state.
- raw sync failures also exist in `SyncRun`, `SyncError`, and webhook records.

### Where the current system is fragmented

The queue exists, but the operator workflow is still fragmented in three ways:

1. Safe retry coverage is incomplete.
   - `REPORT_DELIVERY_FAILURE` can retry.
   - `AUTORESPONDER_FAILURE` can retry.
   - `LEAD_SYNC_FAILURE` cannot retry from the queue yet.
   - `CRM_SYNC_FAILURE` cannot retry from the queue yet.

2. Lead and reporting surfaces still present issue-adjacent status without linking back to the queue item that owns the operational problem.

3. The queue summary and row hints are good enough for triage, but they do not yet emphasize which problems are retryable now versus which require manual data correction.

### Most important issue types now

Given the product state, the highest-value operational issue types are:

1. `LEAD_SYNC_FAILURE`
   - blocks intake trust
   - should support safe retry from persisted webhook/backfill data

2. `CRM_SYNC_FAILURE`
   - blocks downstream lifecycle coverage
   - should support replay from persisted sync request data

3. `UNMAPPED_LEAD`
   - blocks downstream tracking and conversion reporting
   - should route operators to lead workspace remap

4. `STALE_LEAD`
   - highlights missing downstream follow-through

5. `AUTORESPONDER_FAILURE`
   - affects responsiveness

6. `REPORT_DELIVERY_FAILURE`
   - affects client-facing reporting reliability

`MAPPING_CONFLICT` remains important, but it should stay a focused operator correction issue rather than become a separate platform.

### Patterns that can be reused

The repo already has the right reusable patterns:

- `OperatorIssue` with stable `dedupeKey`
- audit trail via `recordAuditEvent`
- `SyncRun` + `SyncError` for technical execution state
- queue/detail service layer in `features/issues/service.ts`
- existing action routes for retry, resolve, ignore, and note
- existing lead and report workspaces that can act as remediation destinations

This means the next slice should refine, not replace, the current system.

### What should become queue items vs stay as passive logs

Queue items:

- failures that need operator action or retry
- data gaps that block downstream tracking
- stale states that need review
- conflicts that require manual resolution

Passive logs only:

- successful sync runs
- successful webhook deliveries
- historical audit events that do not represent a still-active problem
- low-level diagnostic payloads unless an operator drills into issue detail

### Focused model direction

No schema expansion is required unless a hard gap appears during implementation. The existing `OperatorIssue` model already supports:

- normalized issue type
- severity
- open / resolved / ignored state
- linked lead/business/location/report/sync references
- first seen / last seen timestamps
- dedupe
- source attribution
- manual resolution metadata

The main refinement needed is behavioral, not structural:

- broaden retry support
- improve retry eligibility labeling
- surface linked open issues in leads and reporting
- keep queue state as the single operational source of truth

### Planned implementation

#### 1. Safe retry for lead sync failures

Add an explicit lead-sync retry workflow that can:

- reprocess failed or queued Yelp webhook sync runs from stored raw webhook payloads
- rerun failed lead backfill syncs from stored request data

This keeps retries tied to persisted source data instead of inventing new inputs.

#### 2. Safe retry for downstream CRM sync failures

Add an explicit CRM sync retry workflow that replays the original sync request from `SyncRun.requestJson`, including:

- CRM mapping upserts
- partner lifecycle status appends

This preserves the original intent and keeps queue retries trustworthy.

#### 3. Queue shaping

Refine queue shaping so rows and detail pages expose:

- retryable now vs not retryable
- retry label
- clearer target/context hints

#### 4. Lead detail integration

Show linked open operator issues on lead detail so an operator can move from:

lead record -> issue context -> safe action

without guessing whether the visible warning is also tracked centrally.

#### 5. Reporting run integration

Show linked delivery issues on reporting admin surfaces so failed runs point directly into the queue item instead of only showing local run status.

### Operator UX changes

The queue should remain table-first on `/audit`, but become more useful through:

- better retry availability
- tighter next-step labeling
- linked issue context in leads and reporting

The queue is already the correct home. The work is to make it operationally complete.

### Manual QA strategy

1. Trigger or seed a failed webhook sync and confirm:
   - a `LEAD_SYNC_FAILURE` issue appears once
   - retry is available
   - retry records an audit event

2. Trigger or seed a failed CRM sync and confirm:
   - a `CRM_SYNC_FAILURE` issue appears once
   - retry is available when original request data is replayable
   - issue remains open if the failure persists

3. Create an unmapped lead and confirm:
   - `UNMAPPED_LEAD` appears
   - lead detail shows the linked open issue
   - remap path resolves the underlying condition

4. Trigger a report delivery failure and confirm:
   - `/reporting` surfaces the run failure with linked issue access
   - `/audit` shows the same queue item
   - resend stays auditable

5. Resolve and ignore actions:
   - confirm manual actions write audit events
   - confirm cleared issues auto-resolve when the underlying condition disappears
   - confirm ignored issues stay ignored during refresh until the operator changes them
