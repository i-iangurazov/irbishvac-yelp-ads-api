## CRM Connector Plan

### Current downstream sync state

The product already supports downstream lifecycle storage and operator review, but the connector layer is still generic:

- `/api/internal/leads/downstream-sync` accepts authenticated machine writes for mapping and lifecycle updates.
- `CrmLeadMapping`, `CrmStatusEvent`, `SyncRun`, `SyncError`, and `OperatorIssue` already persist the post-Yelp side of the workflow.
- Lead detail already shows partner lifecycle status, mapping state, and CRM sync health.
- Retry paths already exist for `CRM_LEAD_ENRICHMENT` sync failures through the operator queue.

This is a solid downstream data foundation, but not a real connector onboarding flow.

### Current hardcoded or internal-only assumptions

Several assumptions are still buried in code instead of being operator-manageable:

- The downstream system is only described generically as `CRM / ServiceTitan`.
- There is no connector-specific credential or health screen.
- There is no connector-specific connection test.
- Business, location, and service mapping are stored in models, but there is no focused admin UX to maintain them.
- `LOCATION_MAPPING` and `SERVICE_MAPPING` sync types exist, but there is no real operator surface that uses them.
- Diagnostics are split across Settings, Leads, Audit, and a placeholder Integrations page.

### What is missing for a real connector workflow

To make one real connector rollout-ready, the product needs:

1. A named connector surface for the first supported downstream system.
2. Secure credential/config entry with environment and tenant information.
3. A connection-health test that proves the connector can authenticate and read safe reference data.
4. A repeatable reference-data sync for connector-backed mapping choices.
5. Mapping inventory and correction tools for:
   - Yelp business -> internal location
   - internal location -> connector location/business-unit reference
   - service category -> connector category/code reference
6. Clear sync health, recent runs, and failure visibility tied into the existing operator queue.

### First connector choice

The first real connector should be **ServiceTitan**.

Why:

- The repo already describes CRM enrichment as `CRM / ServiceTitan`.
- The product’s downstream lifecycle states match the ServiceTitan-style operating model the repo is already aiming at.
- Building one concrete ServiceTitan workflow is safer than widening into multiple shallow connectors.

### Mapping surfaces that already exist

The schema already gives us enough to build a first operational connector workflow without reworking the data model:

- `Business.locationId` for Yelp business -> internal location assignment
- `Location.externalCrmLocationId` for internal location -> connector reference mapping
- `ServiceCategory.crmCodesJson` and `ServiceCategory.mappingRulesJson` for service mapping
- `CrmLeadMapping` for Yelp lead -> connector/customer/job/opportunity references

The missing piece is not storage. The missing piece is connector UX and operator control.

### Auth, credential, and config surfaces needed

ServiceTitan should use the same secure pattern as the Yelp credentials:

- encrypted secret storage in `CredentialSet`
- no raw secret display after save
- test status and last error persisted on the credential record

The connector needs these config values:

- enabled / disabled
- environment
- tenant ID
- client ID
- client secret
- app key
- API base URL
- auth base URL

The safest implementation is:

- add a dedicated `CRM_SERVICETITAN` credential kind
- store client ID and secret in the existing encrypted credential record
- store non-secret config in `metadataJson`
- keep test status on the credential record like the existing Yelp integrations

### Sync controls needed

The connector surface should support two safe operator/admin actions first:

1. **Test connection**
   - validate auth and a lightweight read path
   - persist the test result

2. **Sync connector reference data**
   - fetch safe reference catalogs needed for mapping
   - persist the sync run
   - expose partial/failure outcomes through `SyncRun`, `SyncError`, and `OperatorIssue`

For this slice, reference sync is enough. It makes mapping operational without pretending a full ServiceTitan lead/job poller already exists.

### Diagnostics operators/admins need

Operators/admins need one place to see:

- whether the connector is configured
- whether auth currently works
- the last successful reference sync
- the last failed or partial sync
- open connector-related issues
- unmapped business/location/service coverage
- missing required connector references

These should link into the existing Audit queue rather than creating a second issue system.

### Proposed implementation

1. Add a new credential kind for ServiceTitan.
2. Add a ServiceTitan client using official OAuth client-credentials flow and app-key headers.
3. Add a dedicated connector service that:
   - reads/saves connector config
   - tests auth
   - syncs reference catalogs
   - shapes mapping health and diagnostics
4. Replace the current placeholder `/integrations` page with a real ServiceTitan connector admin page.
5. Add focused inline forms for:
   - Yelp business -> internal location mapping
   - internal location -> ServiceTitan reference mapping
   - service category -> ServiceTitan category/code mapping
6. Extend issue detection so failed `LOCATION_MAPPING` and `SERVICE_MAPPING` runs show up in the existing queue.

### Source-of-truth boundaries

The connector slice must preserve these boundaries:

- Yelp remains the source of truth for lead intake and on-Yelp engagement.
- ServiceTitan becomes the named downstream system for connector-backed mapping and lifecycle sync setup.
- Internal locations and service categories remain this console’s normalized layer.
- Partner lifecycle statuses remain partner statuses based on Yelp leads, not Yelp-owned statuses.

### Manual QA strategy

1. Save ServiceTitan connector config with valid environment, tenant ID, client ID, client secret, and app key.
2. Run `Save + test` and confirm the health state updates without exposing secrets.
3. Run `Sync reference data` and confirm:
   - `LOCATION_MAPPING` and `SERVICE_MAPPING` sync runs are recorded
   - failures appear in Audit if auth or upstream calls fail
4. Review mapping coverage counts on `/integrations`.
5. Map a Yelp business to an internal location.
6. Map an internal location to a ServiceTitan reference.
7. Map one or more service categories to ServiceTitan codes/categories.
8. Confirm unresolved mapping gaps remain visible instead of disappearing.
9. Confirm lead detail and downstream sync surfaces still behave the same after connector configuration is enabled.

