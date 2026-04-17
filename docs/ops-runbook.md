# Ops Runbook

## Scope

This runbook covers the current production-pilot operating loop:

- Yelp lead intake
- Yelp-thread autoresponder and follow-ups
- downstream lifecycle sync
- recurring report delivery
- ServiceTitan connector checks
- operator queue handling

## 1. Webhook setup and verification

### Required

- Yelp webhook configured to point at:
  - `/api/webhooks/yelp/leads`
- deployed environment has:
  - valid `CRON_SECRET`
  - valid Yelp bearer token / credentials
  - tenant capability flags enabled appropriately

### Verify

1. Confirm Yelp webhook verification succeeds.
2. Send or observe a real webhook delivery.
3. Confirm a lead sync run or webhook event is recorded.
4. Open `/leads` and verify the new lead appears.
5. Open `/audit` and confirm no hidden intake failure exists.

### If webhook intake fails

- check the deployed route is reachable
- check the saved Yelp credentials and capability flags
- check `/audit` for `Yelp reconcile failed` or webhook-processing issues
- use manual historical import only as support recovery, not as the primary live pattern

## 2. Follow-up worker / cron verification

### Routes

- shared reconcile:
  - `/api/internal/reconcile`
- dedicated follow-up worker:
  - `/api/internal/autoresponder/followups`

### Verify

1. Confirm GitHub Actions workflow is running on its 5-minute schedule.
2. Confirm both routes return success with cron auth.
3. Open `/autoresponder` and confirm recent activity is moving.
4. Open a lead with a due follow-up and confirm:
   - send occurs in-thread if eligible
   - due item re-queues when it lands outside working hours

### If follow-ups are not running

- check GitHub Actions run history
- check `RECONCILE_URL`
- check optional `AUTORESPONDER_FOLLOWUPS_URL`
- check `CRON_SECRET`
- open `/audit` for autoresponder failures

## 3. SMTP fallback verification

Only relevant if masked-email fallback is enabled.

### Verify

1. Confirm SMTP env vars are set:
   - `SMTP_HOST`
   - `SMTP_PORT`
   - `SMTP_USER`
   - `SMTP_PASSWORD`
   - `SMTP_FROM`
2. Open `/autoresponder`.
3. Confirm fallback policy is only enabled where intended.
4. Trigger a safe fallback scenario only in a controlled test business.
5. Confirm the result is visible in lead automation history and `/audit`.

### If SMTP fallback fails

- disable fallback in tenant settings or business override
- keep Yelp-thread path as primary
- resolve SMTP before re-enabling fallback

## 4. ServiceTitan connector checks

### Verify

1. Open `/integrations`.
2. Confirm ServiceTitan connector is enabled only where reviewed.
3. Confirm connection health is successful.
4. Confirm recent reference sync / lifecycle sync timestamps are current enough.
5. Confirm no mapping-health spike appears in `/audit`.

### If ServiceTitan sync degrades

- keep connector enabled only if reads still succeed reliably
- retry the specific failed sync from the issue queue if eligible
- review business/location/service mappings
- if lifecycle sync becomes stale, treat reporting confidence as yellow for affected businesses

## 5. Report delivery checks

### Verify

1. Open `/reporting`.
2. Review recent runs and current schedules.
3. Confirm scope and recipient routing are correct:
   - account-wide
   - per-location
4. Confirm failed runs are visible and linked into `/audit`.

### If a report delivery fails

- inspect the failed run scope
- verify recipient routing
- verify SMTP if email delivery is used
- retry from the report run surface or `/audit` if eligible

## 6. Issue queue review steps

Primary queue:

- `/audit`

Daily review order:

1. red / highest-severity open issues
2. failed autoresponder attempts
3. failed lead reconcile or webhook-processing issues
4. stale downstream lifecycle sync
5. failed report deliveries
6. unresolved unmapped leads

## 7. How to pause or disable autoresponder per business

### Preferred path

1. Open `/autoresponder`.
2. Find the relevant Yelp business override.
3. Disable that business override or set its effective autoresponder state off.
4. Save the override.

### Emergency fallback

- disable tenant-wide autoresponder if the problem is broader than one business

Do not rely on deleting templates or rules as the primary emergency stop.

## 8. How to handle failed follow-ups

1. Open `/audit`.
2. Filter to autoresponder or failed follow-up issues.
3. Open the issue detail and confirm:
   - business
   - lead
   - cadence
   - last error
4. If retry is safe, retry the issue.
5. If the failure is due to policy or business-specific config, adjust the override in `/autoresponder`.
6. If a human needs to take over, leave autoresponder disabled for that business or lead path until corrected.

## 9. How to handle failed deliveries

### Lead delivery / intake failure

- inspect webhook error context
- retry reconcile if available
- confirm Yelp lead detail can still be read

### Report delivery failure

- inspect run scope and recipients
- verify SMTP / routing
- resend if safe

### Do not do

- do not mark issues resolved if the underlying failure condition is still active
- do not broaden rollout while red failures are accumulating

## 10. Pilot operating stance

This system should currently be operated as:

- production-pilot ready
- actively monitored
- safe for controlled business rollout
- not yet fully hands-off for wide unattended expansion
