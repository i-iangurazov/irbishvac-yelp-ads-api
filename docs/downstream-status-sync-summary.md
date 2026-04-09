# Downstream Status Sync Summary

## What Was Implemented

This slice turns post-intake lifecycle tracking into a real internal sync path instead of leaving it as operator-only annotations.

Implemented:

- A machine-write downstream sync workflow in [features/crm-enrichment/service.ts](/Users/ilias_iangurazov/Commercial/irbishvac-yelp-ads-api/features/crm-enrichment/service.ts)
  - resolves a Yelp-originated lead by local `leadId` or Yelp `externalLeadId`
  - upserts CRM mapping records
  - appends partner lifecycle events
  - preserves source attribution and timestamps
  - accepts partial success when mapping and lifecycle writes do not both succeed
- An internal authenticated sync route in [app/api/internal/leads/downstream-sync/route.ts](/Users/ilias_iangurazov/Commercial/irbishvac-yelp-ads-api/app/api/internal/leads/downstream-sync/route.ts)
  - intended for CRM/client/API writes
  - protected by `CRON_SECRET`
- First-class `ACTIVE` support in the Prisma lifecycle enum and request schemas
  - [prisma/schema.prisma](/Users/ilias_iangurazov/Commercial/irbishvac-yelp-ads-api/prisma/schema.prisma)
  - [prisma/migrations/0009_add_active_partner_status/migration.sql](/Users/ilias_iangurazov/Commercial/irbishvac-yelp-ads-api/prisma/migrations/0009_add_active_partner_status/migration.sql)
  - [features/crm-enrichment/schemas.ts](/Users/ilias_iangurazov/Commercial/irbishvac-yelp-ads-api/features/crm-enrichment/schemas.ts)
  - [features/leads/schemas.ts](/Users/ilias_iangurazov/Commercial/irbishvac-yelp-ads-api/features/leads/schemas.ts)
- Safe current-status handling
  - older downstream events no longer overwrite the lead’s current partner lifecycle status
  - current status is derived from the ordered lifecycle timeline in [features/crm-enrichment/normalize.ts](/Users/ilias_iangurazov/Commercial/irbishvac-yelp-ads-api/features/crm-enrichment/normalize.ts)
- Lead queue and lead detail enrichment
  - queue now exposes partner lifecycle issue counts and partner sync health in [app/(console)/leads/page.tsx](/Users/ilias_iangurazov/Commercial/irbishvac-yelp-ads-api/app/(console)/leads/page.tsx)
  - lead detail now shows partner sync health alongside the separate Yelp-native and partner lifecycle sections in [app/(console)/leads/[leadId]/page.tsx](/Users/ilias_iangurazov/Commercial/irbishvac-yelp-ads-api/app/(console)/leads/[leadId]/page.tsx)
- Reporting foundation expansion
  - conversion metrics now derive mapped, active, contacted, booked, scheduled, in progress, completed, won, lost, and rate metrics from real partner lifecycle records in [features/crm-enrichment/normalize.ts](/Users/ilias_iangurazov/Commercial/irbishvac-yelp-ads-api/features/crm-enrichment/normalize.ts)
  - reporting overview surfaces these as internal-only partner lifecycle metrics in [app/(console)/reporting/page.tsx](/Users/ilias_iangurazov/Commercial/irbishvac-yelp-ads-api/app/(console)/reporting/page.tsx)

## Which Statuses Are Truly Live

The following partner lifecycle statuses are now accepted in the operator form and internal sync path:

- `ACTIVE`
- `NEW`
- `CONTACTED`
- `BOOKED`
- `SCHEDULED`
- `JOB_IN_PROGRESS`
- `COMPLETED`
- `CANCELED`
- `CLOSED_WON`
- `CLOSED_LOST`

`LOST` still exists in the enum for backward compatibility with earlier internal handling, but the intended operator-facing closing states are `CLOSED_WON` and `CLOSED_LOST`.

## How Source Boundaries Are Preserved

The product now keeps three separate layers clear:

- Yelp-native lead intake, thread activity, read/replied markers, and on-Yelp engagement
- Partner lifecycle records, mapping state, and downstream sync health
- Local operational metadata such as sync runs, sync errors, and manual overrides

This is preserved in:

- storage: `YelpLeadEvent` and `YelpWebhookEvent` remain separate from `CrmLeadMapping` and `CrmStatusEvent`
- page structure: lead detail keeps Yelp-native thread history separate from partner lifecycle history
- copy: downstream stages are described as `partner lifecycle` records based on Yelp leads, not Yelp statuses
- reporting: Yelp-native metrics and partner lifecycle metrics remain visually and semantically separate

## What Remains Out Of Scope

- Automatic CRM connector daemons or vendor-specific connector UI
- Back-syncing lifecycle stages to Yelp
- Revenue, invoice, or payout reporting
- A major reporting UI redesign
- A broad exception platform beyond the focused queue and health indicators that already exist

## Exact Manual QA Steps

1. Make sure a Yelp lead exists locally.
   - Use webhook intake or the manual support import on `/leads`.

2. Open the lead detail page.
   - Confirm the top section shows Yelp-native lead metadata.
   - Confirm the partner lifecycle section is present but separate.

3. Send a downstream sync update through the internal route.
   - `POST /api/internal/leads/downstream-sync`
   - Add `Authorization: Bearer <CRON_SECRET>` or `x-cron-secret: <CRON_SECRET>`
   - Example payload:

```json
{
  "updates": [
    {
      "externalLeadId": "7JKYCZMDDj_tADELwivv2A",
      "sourceSystem": "CRM",
      "mapping": {
        "externalCrmLeadId": "crm-lead-001",
        "externalOpportunityId": "opp-001",
        "externalJobId": "job-001",
        "locationId": null,
        "matchMethod": "external_reference",
        "confidenceScore": 0.98
      },
      "statusEvent": {
        "status": "BOOKED",
        "occurredAt": "2026-04-07T09:30:00.000Z",
        "substatus": "Phone confirmed",
        "payloadJson": {
          "sourceRecordId": "crm-status-001"
        },
        "externalStatusEventId": "crm-status-001"
      }
    }
  ]
}
```

4. Refresh the same lead detail page.
   - Confirm the mapping state is no longer unresolved.
   - Confirm the partner lifecycle timeline now includes `BOOKED`.
   - Confirm the Yelp-native thread section is unchanged.

5. Replay an older downstream event for the same lead.
   - Submit another sync update with an earlier `occurredAt` and status `CONTACTED`.
   - Confirm the event is appended to the timeline, but the current partner lifecycle status remains `BOOKED`.

6. Check the leads queue.
   - Open `/leads`.
   - Confirm the lead row shows the new partner lifecycle status and sync health.
   - Confirm unresolved/problem counts change when mappings are added or remain missing.

7. Check reporting.
   - Open `/reporting`.
   - Confirm the internal conversion foundation reflects mapped/booked counts from real partner lifecycle records.
   - Confirm the copy still states these are internal-only partner lifecycle metrics, not Yelp-native metrics.

8. Check failure handling.
   - Post a downstream sync update with an unknown `externalLeadId`.
   - Confirm the route returns a failed result for that update instead of silently succeeding.

## Verification

Passed on the current tree:

- `pnpm prisma:generate`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`
