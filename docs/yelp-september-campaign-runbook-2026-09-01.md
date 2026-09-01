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
| End-of-Month Boost |         $5,000 | Sep 25-30 | Explicit allowlisted scope required  |

Water Heater and Water Purification remain at $0. They are not separate API
campaigns.

## Production inventory evidence

Read-only inventory was repeated on September 1, 2026 against canonical local
business `cmo7k8w1d01x3jm04ia48ixb5`.

- Yelp returned 185 programs with no duplicate upstream program IDs.
- Old protected main program `A8hZN7g3AQhD3ZKEaGQ89A` is now inactive and
  retains its historical $60,000 budget.
- Replacement main program `YsdHkbWXTbSQ2JWYBO6FRQ` is active, starts on
  September 1, and targets HVAC, Plumbing, and Water Heater. Yelp Program List
  reports its monthly budget as exactly $9,900, not the approved $10,000. The
  $100 mismatch keeps every live September reconciliation gate closed.
- Existing active HVAC program `chZwdNae5UHK2asYXSiizg` has a $12,000 monthly
  budget. The Partner Ads inventory does not identify it as Installation or
  Repair, so it must be explicitly adopted as one layer before another $12,000
  campaign can be created.
- Plumbing plans as `CREATE`; no current $15,000 Plumbing duplicate exists.
- HVAC Maintenance plans as `CREATE`; no current $3,000 duplicate exists.
- Commercial HVAC has the same safe create plan from the same inventory, but
  service targeting remains blocked.
- Caitlyn/Emil confirmed that the End-of-Month Boost may be redirected among
  HVAC Repair, HVAC Installation/Replacement, HVAC Maintenance, Plumbing, and
  Water Heater. The workflow now accepts only those allowlisted directions and
  requires an explicit non-empty selection for each reconciliation. It does not
  infer the initial September 25 scope.

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

The boost requires a JSON allowlist in `SEPTEMBER_BOOST_SCOPES_JSON`. Supported
values are `HVAC_REPAIR`, `HVAC_INSTALLATION`, `HVAC_MAINTENANCE`, `PLUMBING`,
and `WATER_HEATER`. Any boost containing an HVAC direction also requires the
same verified Program Features access and negative-keyword policy as an HVAC
base layer.

```bash
YELP_INVENTORY_BUSINESS_ID=<local-business-id> \
YELP_MAIN_PROGRAM_ID=<upstream-main-program-id> \
SEPTEMBER_CAMPAIGN_LAYER=SEPTEMBER_END_OF_MONTH_BOOST \
SEPTEMBER_BOOST_SCOPES_JSON='["PLUMBING","WATER_HEATER"]' \
pnpm yelp:reconcile:september
```

## Remaining external actions

1. Emil corrects replacement main program `YsdHkbWXTbSQ2JWYBO6FRQ` from the
   provider-reported $9,900 to exactly $10,000, or Yelp explains and documents
   why a $10,000 cabinet setting is returned as $9,900 by Program List.
2. Yelp enables/provides Data Ingestion / Program Features Basic Auth access.
3. Emil or Tim identifies whether `chZwdNae5UHK2asYXSiizg` is Installation or
   Repair and approves the blocked-keyword policy for every HVAC layer.
4. Emil or Tim selects the initial September 25 boost directions from the
   confirmed allowlist.
5. Yelp or Emil provides the exact Yelp business/program ID for “Services Corp,
   test listing.” It is absent from local business records and cannot be safely
   deleted by display-name guesswork.

## Naming limitation

The Ads API contract does not expose a display-name rename operation. The app
uses clear local labels after reconciliation. Any Yelp cabinet display-name
rename must be completed manually in Yelp or through a Yelp-provided endpoint.
