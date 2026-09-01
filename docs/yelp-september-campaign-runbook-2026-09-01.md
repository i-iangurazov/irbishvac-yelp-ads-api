# Yelp September 2026 Campaign Runbook

## Approved structure

The Ads API must not mutate the main campaign. Emil manages it manually.

| Campaign           | Monthly budget | Dates     | API state                            |
| ------------------ | -------------: | --------- | ------------------------------------ |
| Main               |        $10,000 | September | Protected external prerequisite      |
| HVAC Installation  |        $12,000 | Sep 1-30  | Audited reconciliation only          |
| HVAC Repair        |        $12,000 | Sep 1-30  | Audited reconciliation only          |
| HVAC Maintenance   |         $3,000 | Sep 1-30  | Audited reconciliation only          |
| Commercial HVAC    |         $3,000 | Sep 1-30  | Audited reconciliation only          |
| Plumbing           |        $15,000 | Sep 1-30  | Audited reconciliation only          |
| End-of-Month Boost |         $5,000 | Sep 25-30 | Blocked pending approved trade scope |

Water Heater and Water Purification remain at $0. They are not separate API
campaigns.

## Production inventory evidence

Read-only inventory completed on September 1, 2026 against canonical local
business `cmo7k8w1d01x3jm04ia48ixb5`.

- Yelp returned 177 programs with no duplicate upstream program IDs.
- Protected main program `A8hZN7g3AQhD3ZKEaGQ89A` is active but still has a
  $60,000 monthly budget. The approved prerequisite is $10,000.
- Existing active HVAC program `chZwdNae5UHK2asYXSiizg` has a $12,000 monthly
  budget. The Partner Ads inventory does not identify it as Installation or
  Repair, so it must be explicitly adopted as one layer before another $12,000
  campaign can be created.
- Plumbing plans as `CREATE`; no current $15,000 Plumbing duplicate exists.
- HVAC Maintenance plans as `CREATE`; no current $3,000 duplicate exists.
- Commercial HVAC has the same safe create plan from the same inventory, but
  service targeting remains blocked.
- The End-of-Month Boost remains blocked until Caitlyn confirms its trade scope.

No Yelp campaign mutation was submitted during these checks.

## Service-targeting blocker

All four HVAC layers require service-specific targeting. Yelp Program List
reports Negative Keyword Targeting on current programs, but the Program Features
API requires the tenant's Data Ingestion Basic Auth credential. That credential
is not configured, so the provider preflight returns `MISSING_ACCESS`.

The live workflow requires all of the following before it can submit an HVAC
campaign:

1. Successful provider read of `NEGATIVE_KEYWORD_TARGETING`.
2. An approved non-empty blocked-keyword list for that specific layer.
3. Explicit service-targeting confirmation.
4. Provider read-back after the keyword write.

The generic program create/edit endpoints cannot bypass these gates.

## Safe operator command

The command defaults to dry-run. It performs a canonical inventory and records
an audit event.

```bash
YELP_INVENTORY_BUSINESS_ID=<local-business-id> \
YELP_MAIN_PROGRAM_ID=<upstream-main-program-id> \
SEPTEMBER_CAMPAIGN_LAYER=SEPTEMBER_PLUMBING \
pnpm yelp:reconcile:september
```

Live mode additionally requires `SEPTEMBER_CAMPAIGN_APPLY=1`. HVAC layers also
require `SEPTEMBER_SERVICE_TARGETING_CONFIRMED=1` and an approved JSON array in
`SEPTEMBER_BLOCKED_KEYWORDS_JSON`. An existing Yelp program is adopted only when
its exact ID is supplied in `SEPTEMBER_ADOPT_UPSTREAM_PROGRAM_ID`.

## Remaining external actions

1. Emil changes the protected main campaign from $60,000 to $10,000 in Yelp.
2. Yelp enables/provides Data Ingestion / Program Features Basic Auth access.
3. Emil or Tim identifies whether `chZwdNae5UHK2asYXSiizg` is Installation or
   Repair and approves the blocked-keyword policy for every HVAC layer.
4. Caitlyn confirms the End-of-Month Boost trade scope.
5. Yelp or Emil provides the exact Yelp business/program ID for “Services Corp,
   test listing.” It is absent from local business records and cannot be safely
   deleted by display-name guesswork.

## Naming limitation

The Ads API contract does not expose a display-name rename operation. The app
uses clear local labels after reconciliation. Any Yelp cabinet display-name
rename must be completed manually in Yelp or through a Yelp-provided endpoint.
