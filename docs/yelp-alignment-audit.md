# Yelp Alignment Audit

Date: 2026-04-07

This audit compares the current implementation to the guidance received from Yelp support.

## 1. Where the current implementation already matches Yelp guidance

- Yelp lead reads use the official Leads API bearer-auth flow.
  - `GET /v3/leads/{id}`
  - `GET /v3/leads/{id}/events`
  - `POST /v3/leads/{id}/events`
  - `POST /v3/leads/{id}/events/mark_as_read`
  - `POST /v3/leads/{id}/mark_as_replied`
- Lead snapshots are normalized into separate local records.
  - Yelp-native lead record
  - Yelp-native event timeline
  - partner lifecycle timeline
  - local delivery / sync history
- Lead record upserts are already keyed by `tenantId + externalLeadId`, so the local lead snapshot itself is idempotent at the lead level.
- Event upserts are already keyed by a stable event key, so duplicate event storage is avoided.
- Reporting already separates Yelp batch metrics from internal conversion metrics in the main reporting surfaces.
- The reply flow already prefers Yelp-thread replies over masked-email fallback when a live thread write is available.

## 2. Where the current implementation does not match Yelp guidance yet

- Webhook intake is still synchronous.
  - The webhook route currently validates payloads and then performs full `Get Lead` / `Get Lead Events` processing inline.
  - That violates the recommended fast webhook -> async read/process pattern.
- Manual import is still too prominent on the Leads page.
  - Backfill exists for support and historical import, but the UI still makes it look like a normal top-level operating path instead of support tooling.
- Idempotency is stronger at the lead snapshot level than at the queued processing level.
  - The lead record is idempotent by `lead_id`.
  - Webhook processing is still deduped primarily by the delivery/event key, not by an explicit queued lead-processing workflow.
- Some product copy still uses generic `internal lifecycle` language instead of the clearer `partner lifecycle status based on Yelp leads`.
- Audit and issue surfaces can still expose more consumer contact context than is necessary for operator triage.

## 3. Is current ingestion webhook-first or import-first?

It is mixed, and that is a problem.

- Architecturally, the system already has a webhook route and uses the recommended read-after-webhook pattern.
- Operationally, the webhook route still performs the heavy work inline.
- Product-wise, the Leads page still shows manual import as a primary top-area action.

So the codebase is not fully webhook-first yet. It is closer to:

- webhook-capable
- import-supported
- not yet clearly webhook-led in architecture or UI

## 4. Is lead processing truly idempotent by `lead_id`?

Partially.

- `YelpLead` upserts are keyed by `tenantId + externalLeadId`, which is the correct local idempotency key for the lead snapshot.
- Event records are upserted by stable event keys.
- Duplicate webhook deliveries are suppressed by the webhook event key.

But the processing workflow is not yet modeled as a queued lead-processing system keyed primarily around `lead_id`.

That means:

- the stored lead state is idempotent
- the heavy processing path is not yet cleanly queue-based and retry-oriented

## 5. Is autoresponder email-first or Yelp-thread-first?

The live send path is already Yelp-thread-first in service logic when available.

Current positives:

- Yelp thread is the default primary reply path.
- External email is used as fallback when the Yelp thread is unavailable and a masked email exists.

Current gaps:

- settings and admin surfaces still need clearer language that Yelp thread is the intended primary path
- support-style external reply markers need to remain clearly secondary to on-thread messaging

## 6. Where current UI/product copy incorrectly suggests internal statuses are Yelp statuses

The problem is not outright mislabeling, but under-labeling.

Current weak spots:

- Leads queue uses `Internal` as a column label instead of a more precise `Partner lifecycle`.
- Lead detail still uses `Internal lifecycle` / `Internal status update` in places where Yelp asked for downstream statuses to be positioned as partner-managed lifecycle states.
- Some supporting descriptions say `internal lifecycle` without reinforcing that these are not Yelp-owned statuses.

## 7. Do any flows risk off-thread behavior that Yelp warned against?

Yes, in a limited way.

- External masked-email fallback is still supported, which is acceptable as fallback.
- The risk is not the existence of fallback itself.
- The risk is allowing the UI to make fallback feel like a normal peer to the Yelp thread instead of a secondary path.

Current risk level:

- moderate in product presentation
- lower in actual send logic, because the service already prefers Yelp thread first

## 8. What must be changed first

1. Move webhook intake to a fast queue/enqueue step and process the Yelp read pattern asynchronously through the existing reconcile infrastructure.
2. Keep manual import, but demote it to support/backfill wording instead of primary live intake.
3. Tighten the leads UI and lead detail copy to say `partner lifecycle` instead of generic `internal lifecycle` where that boundary matters.
4. Keep Yelp-thread messaging as the default live path and make off-thread actions visibly secondary.
5. Reduce unnecessary exposure of consumer contact data outside the lead detail reply context.
