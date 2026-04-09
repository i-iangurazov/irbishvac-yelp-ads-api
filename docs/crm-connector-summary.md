## CRM Connector Summary

### What was implemented

The first real downstream connector workflow is now **ServiceTitan**.

This slice adds:

- a dedicated ServiceTitan connector admin surface on `/integrations`
- secure connector credential/config storage using the existing encrypted credential pattern
- a real connection test using ServiceTitan OAuth client-credentials plus a safe employee read probe
- reference-data sync for:
  - ServiceTitan business units
  - ServiceTitan pricebook categories
- operator/admin mapping UX for:
  - Yelp business -> internal location
  - internal location -> ServiceTitan reference
  - service category -> ServiceTitan category/code
- connector health and recent sync visibility
- connector-related issue visibility in the existing Audit queue

### What connector workflow is truly live

The following workflow is now live:

1. Save ServiceTitan config in-product.
2. Test the connection in-product.
3. Sync connector reference catalogs in-product.
4. Review and correct mapping coverage in-product.
5. Review connector failures through the existing Audit queue.

This makes the first downstream connector operational for onboarding and mapping management.

### What admins and operators can configure

Admins can now configure:

- connector enabled/disabled state
- environment
- tenant ID
- client ID
- client secret
- app key
- API base URL
- auth base URL

Admins can also:

- assign Yelp businesses to internal locations
- assign internal locations to ServiceTitan references
- assign service categories to ServiceTitan category codes/references

Operators can:

- view connector health
- review mapping coverage
- run safe connector reference syncs if they already have sync permissions
- follow connector failures into the Audit queue

### What remains intentionally manual or out of scope

This slice deliberately does **not** attempt to do everything a full ServiceTitan connector might eventually do.

Out of scope for now:

- automatic ServiceTitan lead/job lifecycle polling
- automatic creation of internal locations from ServiceTitan
- bulk mapping actions
- multi-connector support
- destructive connector reset actions
- a client-facing connector portal

The downstream lifecycle sync layer remains in place for machine-write or connector-worker updates, but this slice does not yet add a full ServiceTitan lifecycle puller.

### Assumptions and limitations

- ServiceTitan is the first connector because the repo already treated `CRM / ServiceTitan` as the intended downstream system.
- Connection testing uses ServiceTitan’s documented OAuth flow and a safe read probe.
- Reference sync currently focuses on business units and pricebook categories because they are the most useful low-risk mapping catalogs for this product.
- Internal `Location.externalCrmLocationId` is used as the first connector reference field for ServiceTitan location/business-unit mapping.
- Service mapping currently stores ServiceTitan IDs or names in `ServiceCategory.crmCodesJson`.
- Connector failures are folded into the existing operator queue instead of a second issue system.

### Exact manual QA steps

1. Open `/integrations`.
2. Save ServiceTitan connector config with:
   - environment
   - tenant ID
   - client ID
   - client secret
   - app key
   - API base URL
   - auth base URL
3. Click `Save + test`.
4. Confirm the connector status changes from `Not configured` / `Untested` to a successful tested state.
5. Click `Sync locations + services`.
6. Confirm recent connector syncs show new `LOCATION_MAPPING` and `SERVICE_MAPPING` runs.
7. Confirm the business-unit and category catalog freshness timestamps update.
8. Assign at least one Yelp business to an internal location.
9. Assign at least one internal location to a ServiceTitan reference.
10. Assign at least one service category to a ServiceTitan category/code.
11. Confirm unmapped businesses, locations, or services remain visible instead of disappearing.
12. If a test or sync fails, open `/audit` and confirm the failure is visible as an actionable issue.

