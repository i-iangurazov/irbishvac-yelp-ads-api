# Yelp September 2026 Campaign Runbook

## Approved structure

The Ads API must not mutate the main campaign. Emil manages it manually.

| Campaign           | Monthly budget | Dates     | API state                                          |
| ------------------ | -------------: | --------- | -------------------------------------------------- |
| Main               |         $9,900 | September | Active; externally managed; operator approved      |
| HVAC Installation  |        $12,000 | Sep 1-30  | Targeting ready; pending existing-layer assignment |
| HVAC Repair        |        $12,000 | Sep 1-30  | Targeting ready; pending existing-layer assignment |
| HVAC Maintenance   |         $3,000 | Sep 1-30  | Targeting ready; pending live apply                |
| Commercial HVAC    |         $3,000 | Sep 1-30  | Targeting ready; pending live apply                |
| Plumbing           |        $15,000 | Sep 1-30  | Active and Yelp-verified                           |
| End-of-Month Boost |         $5,000 | Sep 25-30 | Scheduled and Yelp-verified                        |

Water Heater and Water Purification remain at $0. They are not separate API
campaigns.

## Production inventory evidence

Read-only inventory was repeated on September 1, 2026 against canonical local
business `cmo7k8w1d01x3jm04ia48ixb5`.

- Yelp returned 187 programs after the two approved creates, with no duplicate
  upstream program IDs and no provider errors.
- Old protected main program `A8hZN7g3AQhD3ZKEaGQ89A` is now inactive and
  retains its historical $60,000 budget.
- Replacement main program `YsdHkbWXTbSQ2JWYBO6FRQ` is active, starts on
  September 1, and targets HVAC, Plumbing, and Water Heater. Yelp Program List
  reports its monthly budget as exactly $9,900. The operator explicitly
  approved this provider value on September 1. The workflow accepts only this
  exact read-back or the originally discussed $10,000 value.
- Existing active HVAC program `chZwdNae5UHK2asYXSiizg` has a $12,000 monthly
  budget. The Partner Ads inventory does not identify it as Installation or
  Repair, so it must be explicitly adopted as one layer before another $12,000
  campaign can be created.
- Plumbing `ZKnDBk9eS2jJa7Xi3a3Cjg` is active at exactly $15,000, targets only
  `plumbing`, and ends September 30. The create job completed and the
  idempotent reconciliation passed exact Yelp read-back.
- HVAC Maintenance plans as `CREATE`; no current $3,000 duplicate exists.
- Commercial HVAC has the same safe create plan from the same inventory.
- Caitlyn/Emil confirmed that the End-of-Month Boost may be redirected among
  HVAC Repair, HVAC Installation/Replacement, HVAC Maintenance, Plumbing, and
  Water Heater. Boost `80ss91a6TCoIZ4qHnDI5Gg` was created with all five
  approved directions and maps to Yelp categories `hvac`, `plumbing`, and
  `waterheaterinstallrepair`. It is exactly $5,000 for September 25-30. Yelp
  reports future programs as `INACTIVE`; the application correctly retains it
  as `SCHEDULED`, and exact provider read-back passed.

## End-of-Month Boost focus controls

The Programs screen provides five allowlisted switches and quick presets for
HVAC Repair, HVAC Installation/Replacement, HVAC Maintenance, Plumbing, and
Water Heater. An operator selects the focus and confirms one audited operation;
the browser never submits arbitrary Yelp keyword IDs.

- Category aliases are derived server-side from the selected directions.
- Partial HVAC focus uses the fixed Yelp-derived negative-keyword policies.
- Plumbing and Water Heater terms remain allowed when those categories are
  selected alongside a partial HVAC focus.
- Returning to all HVAC directions or a non-HVAC focus clears stale HVAC
  service exclusions.
- A change is reported successful only after Yelp category and Program Features
  read-back succeeds.

## Service-targeting evidence

All four HVAC layers require service-specific targeting. On September 1, the
operator supplied Data Ingestion Basic Auth credentials. The application:

- verified the credentials read-only against
  `GET /program/{program_id}/features/v1`;
- received HTTP 200 for Main, the existing $12,000 HVAC program, Plumbing, and
  the scheduled End-of-Month Boost;
- loaded Yelp's live suggested and blocked keyword sets;
- saved the credential encrypted in the tenant credential store;
- enabled the Program Features capability and recorded an audited successful
  connection test.

The Yelp client now sends the provider-required product `User-Agent`; a focused
regression test covers this header.

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
and `WATER_HEATER`. A partial HVAC scope requires Program Features access. The
approved boost selects all three HVAC directions, so it covers the full Yelp
HVAC category and needs no service exclusions.

```bash
YELP_INVENTORY_BUSINESS_ID=<local-business-id> \
YELP_MAIN_PROGRAM_ID=<upstream-main-program-id> \
SEPTEMBER_CAMPAIGN_LAYER=SEPTEMBER_END_OF_MONTH_BOOST \
SEPTEMBER_BOOST_SCOPES_JSON='["HVAC_REPAIR","HVAC_INSTALLATION","HVAC_MAINTENANCE","PLUMBING","WATER_HEATER"]' \
pnpm yelp:reconcile:september
```

## Remaining live actions

1. Apply existing $12,000 program `chZwdNae5UHK2asYXSiizg` as HVAC Repair with
   the verified 39-term provider-derived policy. The dry-run passed with no
   blockers; the live request has not been sent.
2. Apply and read back Installation, Maintenance, and Commercial after the
   Repair assignment prevents a duplicate $12,000 layer.
3. Yelp or Emil provides the exact Yelp business/program ID for “Services Corp,
   test listing.” It is absent from local business records and cannot be safely
   deleted by display-name guesswork.

## Naming limitation

The Ads API contract does not expose a display-name rename operation. The app
uses clear local labels after reconciliation. Any Yelp cabinet display-name
rename must be completed manually in Yelp or through a Yelp-provided endpoint.
