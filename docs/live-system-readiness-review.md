# Live System Readiness Review

## 1. Blunt judgment

This system is **partially live**.

It is no longer mostly scaffolded. The core operator loop exists in code and can be exercised end to end:

- Yelp lead intake
- normalized lead storage
- lead detail and timeline review
- internal CRM mapping and lifecycle state
- conversion reporting
- location and service breakdowns
- recurring report generation and delivery
- first-response automation
- issue queue and audit trail

But it is not fully production-hardened in every dependency path yet. The biggest reasons it is only partially live are:

- webhook delivery still depends on a real public deployment and Yelp-side subscription setup
- CRM synchronization is operational through internal routes and operator workflows, but not through a dedicated external connector process
- report delivery and autoresponder depend on SMTP being configured correctly
- OAuth and business-access management still live outside the product
- some secondary routes are still supporting/diagnostic surfaces, not finished operator products

If those dependencies are configured, the system can do real work. If they are not, the product falls back to manual/operator-driven paths rather than failing invisibly. That is good, but it is still not the same thing as “fully live.”

## 2. Route-by-route readiness review

### `/dashboard`

Readiness: **usable, but summary-first**

What is good:

- surfaces credential blockers
- points operators toward Leads, Programs, Reporting, and Audit
- shows active program and delayed reporting state

What is weak:

- still more of a launchpad than an active operational cockpit
- does not yet summarize all live-system failure modes as directly as `/audit`

Verdict:

- safe to demo as the entry page
- do not oversell it as the primary work surface

### `/leads`

Readiness: **live**

What is good:

- supports real Yelp intake by webhook and manual import
- stores and displays normalized leads
- shows business, Yelp state, CRM mapping, internal lifecycle, automation, and sync state
- shows recent delivery failures
- makes source boundaries explicit

What is weak:

- manual import is only as complete as the Yelp `lead_ids` response currently returned
- operators still need to understand the distinction between webhook-delivered leads and imported leads

Verdict:

- this is a real operator module now
- it is ready for primary navigation and live use

### `/leads/[leadId]`

Readiness: **live**

What is good:

- clearly separates Yelp-native timeline, CRM/internal lifecycle, automation history, and webhook/raw debug context
- shows current mapping state and sync context
- supports operator mapping and lifecycle actions

What is weak:

- debug/raw sections are functional but not especially polished
- relies on operators understanding internal terminology such as manual override and sync error state

Verdict:

- trustworthy enough for real investigation and follow-up work

### `/businesses`

Readiness: **live for the current product loop**

What is good:

- supports business readiness review
- connects saved businesses to launch and reporting workflows
- still useful as the staging point for programs and lead import targets

What is weak:

- business access/subscription coverage still lives partly outside the app

Verdict:

- ready for live use in the current operating loop

### `/programs`

Readiness: **live**

What is good:

- supports the core Ads workflow
- keeps async Yelp job behavior explicit
- includes job visibility and honest state handling

What is weak:

- still depends on upstream Yelp job completion timing

Verdict:

- ready and credible

### `/reporting`

Readiness: **live with delayed-data constraints**

What is good:

- supports real Yelp batch report requests
- supports recurring schedules and recent run visibility
- clearly distinguishes Yelp batch metrics from internal-derived outcomes

What is weak:

- freshness is bounded by Yelp batch generation
- recurring delivery is only fully live if SMTP is configured

Verdict:

- ready to use
- must always be demoed as delayed/batch-based, never as real-time attribution

### `/reporting/[reportId]`

Readiness: **live**

What is good:

- shows real report detail
- supports location and service breakdowns
- preserves unknown/unmapped buckets
- supports CSV export

What is weak:

- service-level spend remains limited by the structure of saved Yelp payloads

Verdict:

- safe to demo and use operationally

### `/settings`

Readiness: **live for current operator/admin dependencies**

What is good:

- supports real credential management
- supports capability gating
- supports autoresponder configuration
- explains bearer token versus Ads basic auth correctly

What is weak:

- OAuth/business allowlist management is still not in-product
- internal enum/history around “Fusion” can still confuse future maintainers even though the UI is now clearer

Verdict:

- trustworthy for admin operation
- not a complete Yelp partner access management portal

### `/audit`

Readiness: **live**

What is good:

- functions as an operator queue
- exposes issue severity, status, filters, and recent events
- links issue handling back to the lead/report workflow

What is weak:

- queue refresh is request-driven, not backed by a separate periodic reconciler

Verdict:

- ready for daily operational use

### `/audit/issues/[issueId]`

Readiness: **live**

- issue detail is actionable and auditable
- retry/remap/resolve/ignore/note paths are clear

Verdict:

- trustworthy enough to demo as the exception-handling surface

### `/integrations`

Readiness: **not primary-demo ready**

- still reads as a supporting diagnostic surface
- not the place to demonstrate the system as a coherent product

### `/locations`

Readiness: **not primary-demo ready**

- useful as supporting mapping data
- not yet a first-class operator workflow

### `/services`

Readiness: **not primary-demo ready**

- same status as Locations
- useful support data, not a headline product surface

## 3. Data-flow readiness review

### Yelp lead intake

Readiness: **partially live**

Good:

- webhook route exists
- manual import exists
- raw payload persistence exists
- normalized storage exists
- idempotency exists

Risk:

- webhook path still depends on public deployment and Yelp subscription configuration

### Lead normalization and storage

Readiness: **live**

- normalized `YelpLead` and `YelpLeadEvent` records are persisted safely
- duplicate handling is implemented
- raw payloads remain available for debugging

### CRM/internal mapping and lifecycle

Readiness: **partially live**

Good:

- separate internal timeline exists
- mapping state exists
- conflict/error/unresolved handling exists
- internal API routes exist

Risk:

- no dedicated external connector process yet
- still depends on operator or client/API writes into the authenticated app routes

### Conversion analytics

Readiness: **live**

- metrics are derived from real stored lead and internal status data
- source boundaries are explicit

### Location/service breakdowns

Readiness: **live**

- grouped reporting works
- unknown buckets are preserved

Risk:

- spend grouping is only as good as the available Yelp payload granularity

### Recurring report generation and delivery

Readiness: **partially live**

Good:

- schedules, runs, generation states, and delivery states are all persisted
- manual resend/regenerate exists

Risk:

- SMTP is a hard dependency
- live trust depends on operators understanding delayed Yelp reporting windows

### Autoresponder

Readiness: **partially live**

Good:

- trigger, rules, template rendering, delivery attempts, and auditability exist

Risk:

- email only
- after-hours logic skips rather than queues
- SMTP dependency applies here too

### Issue handling and auditability

Readiness: **live**

- issues are visible
- manual actions are logged
- key retry paths exist

## 4. Top unresolved risks

1. **Webhook deployment risk**
   - the code is ready, but the system is not truly live until the public route is deployed and Yelp is pointed to it successfully.

2. **Partner access configuration risk**
   - bearer token, Ads basic auth, business access, and subscription state still require external coordination.

3. **CRM connector gap**
   - internal status sync is real, but still depends on app-mediated writes rather than a dedicated external sync worker.

4. **SMTP dependency**
   - report delivery and autoresponder can fail operationally even when the product logic is correct.

5. **Upstream Yelp limits**
   - `lead_ids` behavior currently constrains how much history can be backfilled in one pass.

6. **Operator misunderstanding risk**
   - if someone demos or uses Reporting as if it were live attribution, they will overclaim what the product actually does.

## 5. Top UX rough edges

1. Dashboard is still slightly too abstract compared with the very concrete `/leads` and `/audit` surfaces.
2. Raw/debug sections are functional but visually plain.
3. Secondary routes still exist and can distract from the core workflow if shown without explanation.
4. Some terminology remains somewhat technical for operators:
   - manual override
   - sync run
   - processing state
   - provider metadata
5. Settings is much better now, but still carries some mental load around credential kinds and external OAuth inputs.

## 6. Exact manual QA steps for the full end-to-end flow

### Environment and access

1. Open `/settings`.
2. Save:
   - Ads basic auth
   - Yelp API bearer token
3. Confirm the relevant capability flags are enabled:
   - Leads API
   - Ads API
   - Reporting API
   - CRM Integration
4. If testing delivery/automation, confirm SMTP env vars are configured.

### Business and program foundation

5. Open `/businesses`.
6. Confirm at least one real Yelp business is saved locally.
7. Open a business detail page and confirm readiness state is visible.
8. Open `/programs` and confirm current programs load without breaking the existing Ads flow.

### Yelp lead intake

9. Open `/leads`.
10. Use `Sync Yelp leads` for a saved business.
11. Confirm:
   - queue rows appear
   - counts update
   - latest import status is visible
12. If webhook delivery is configured, send or receive a real Yelp webhook and confirm:
   - raw delivery is stored
   - the queue updates without duplicate records

### Lead detail and CRM/internal state

13. Open one imported lead from `/leads`.
14. Confirm the detail page shows:
   - Yelp lead summary
   - Yelp-native event timeline
   - CRM mapping state
   - internal lifecycle timeline
   - automation section
   - webhook/raw debug section
15. Save a CRM mapping.
16. Add one or more internal lifecycle statuses:
   - contacted
   - booked
   - scheduled
   - completed
17. Confirm the queue row and lead detail both reflect those internal states without changing the Yelp timeline.

### Conversion reporting

18. Open `/reporting`.
19. Request a Yelp batch report.
20. Poll or wait until it is ready.
21. Open `/reporting/{reportId}`.
22. Confirm:
   - source boundaries are explicit
   - location breakdown works
   - service breakdown works
   - unknown buckets remain visible
23. Export CSV and confirm the filtered view is reflected correctly.

### Recurring delivery

24. On `/reporting`, create a weekly or monthly schedule.
25. Trigger `Generate now`.
26. Confirm:
   - a run record is created
   - generation state progresses
   - delivery state progresses
27. If SMTP is configured, confirm email delivery succeeds with CSV attachment or dashboard link.
28. If SMTP is intentionally missing, confirm the run fails visibly rather than disappearing.

### Autoresponder

29. Open `/settings`.
30. Enable the autoresponder.
31. Create a template and at least one matching rule.
32. Ingest a brand-new lead.
33. Confirm:
   - the lead queue shows automation state
   - lead detail shows attempt history
   - sent/skipped/failed states are visible

### Audit and issue handling

34. Open `/audit`.
35. Confirm open issues appear when applicable.
36. Open an issue detail page.
37. Exercise:
   - retry where available
   - resolve
   - ignore with reason
   - note
38. Confirm each action appears in the audit trail.

## 7. What should NOT be demoed yet

1. **Webhook intake as “fully deployed”**
   - do not demo this unless the public webhook route is confirmed live and Yelp is actually delivering to it.

2. **CRM sync as a fully automated external connector**
   - it is not that yet. It is a real internal/client API write path plus operator workflow.

3. **Reporting as real-time attribution**
   - this would be misleading.

4. **Autoresponder as multichannel automation**
   - only email is trustworthy in the current repo.

5. **Integrations, Locations, and Services as mature products**
   - they are still supporting surfaces.

6. **OAuth/business access management as an in-product admin flow**
   - those values are recognized, but the full operational flow remains outside the app.

## Final readiness conclusion

This product is **credible enough to run live operations in a controlled internal environment**, but it should still be described as **partially live** rather than fully live.

The core reason is not missing product breadth. The core reason is that a few external dependencies still determine whether the code’s live paths are actually active:

- webhook deployment
- Yelp-side configuration
- SMTP
- external CRM/client write path

Within those limits, the repo is no longer a concept demo. It is an operational system with explicit boundaries and visible failure modes. That is a strong position, but it is not yet “all dependencies fully closed.” 
