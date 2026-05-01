# Yelp Business Onboarding Checklist

This checklist is for adding another Yelp business to the existing lead-intake and autoresponder pilot. It does not change product scope; it keeps each new business explicit, testable, and reversible.

## Scope

Use this for businesses where Snow Leopard/Irbis should receive Yelp Leads traffic, sync recent leads, and optionally run Yelp-thread autoresponder behavior.

Do not treat Ads API rollout as solved by this checklist. Yelp still needs to clarify the future Ads API credential/onboarding model for broader client rollout.

## Required Setup

1. Confirm Yelp admin access.
   The Snow Leopard/Yelp integration user must be added as a business admin for the Yelp business/location.

2. Save the business in this console.
   Add the Yelp encrypted business ID, business name, location context, and categories where available.

3. Add the business to webhook forwarder allowlist.
   The external webhook forwarding app must allow the Yelp business ID before it forwards payloads to this platform.
   Mirror the same comma-separated IDs in this app's `YELP_ALLOWED_BUSINESS_IDS` if you want the business detail readiness card to detect allowlist gaps.

4. Subscribe the business in Yelp.
   Use Yelp's business subscriptions endpoint: `POST /v3/businesses/subscriptions`.
   In this console, open the business detail page and use `Request webhook subscription` in the `Yelp Leads onboarding` card.
   Reference: `https://docs.developer.yelp.com/reference/create_business_subscriptions`.

5. Verify the business is readable by the Leads API.
   In this console, open the business detail page and use `Check Leads API`.
   This performs a safe `lead_ids` read with `limit=1`; it does not send messages or start automation.

6. Keep the public webhook URL stable.
   Yelp should remain pointed at:
   `https://irbishvac-yelp-leads-api-webhook-m7.vercel.app/api/webhooks/yelp/leads`.

7. Point the forwarder to the main platform.
   `MAIN_PLATFORM_WEBHOOK_URL=https://irbishvac-yelp-ads-api.vercel.app/api/webhooks/yelp/leads`.

8. Use the same shared secret on both sides.
   The webhook forwarder sends `x-irbis-forward-secret`; the main platform must validate the same value.

## Verification Steps

1. Verify webhook challenge.
   ```bash
   curl -i "https://irbishvac-yelp-leads-api-webhook-m7.vercel.app/api/webhooks/yelp/leads?verification=test123"
   ```
   Expected: `200` with body `test123`.

2. Verify the business is in the forwarder allowlist.
   Send a test payload using the real Yelp business ID. Expected response from the forwarder is `202` and `forwarded: true`.

3. Verify main-platform intake.
   Confirm the main app records a `YelpWebhookEvent` and the related `SyncRun`.

4. Run reconcile.
   Confirm the latest Yelp lead payload is fetched and the lead appears on `/leads`.

5. Check business detail.
   Open the business detail page and review `Yelp Leads onboarding`. The required live path is:
   - Local Yelp business mapped
   - Leads API access ready
   - Forwarder allowlist ready or manually verified
   - Leads API read proof ready
   - Webhook/subscription proof ready
   - Lead reconcile proof ready
   - Autoresponder scope correct

6. Verify the subscription after Yelp processes it.
   Yelp processes subscription create/delete requests asynchronously. The docs say successful `202` only means processing started, not that the subscription is active. Use `Check subscription` in the `Yelp Leads onboarding` card after a few minutes, or confirm with live webhook traffic.

7. Check autoresponder scope.
   For the current pilot, keep automation limited to the test business until live-client rollout is intentionally approved.

8. Send a real Yelp thread test.
   Confirm the message appears in Yelp, the lead updates in this console, and the automation attempt/audit trail is visible.

## Direct Phone Number Behavior

Yelp confirmed request-to-quote leads can now provide the consumer's direct verified phone number after verification. Treat this as a two-step lead update:

1. Initial lead notification may arrive without a direct phone number.
2. A later lead update may include `phone_number` once the consumer verifies and shares it.

The app now preserves stronger phone proof when later syncs omit or downgrade phone fields. Direct verified phone numbers should take priority over temporary or masked numbers.

## Rollback

If a business misbehaves during setup:

1. Disable the business in Autoresponder scope or add a disabled business override.
2. Remove or pause the business subscription in Yelp if needed.
3. Remove the Yelp business ID from the forwarder allowlist if webhook traffic should be blocked.
4. Mirror the allowlist change in this app's `YELP_ALLOWED_BUSINESS_IDS` so the readiness card stays accurate.
5. Review `/audit` for failed webhook, reconcile, send, or conversation automation events.

## Open Yelp Questions

These are still not fully proven in production and should stay explicit:

1. Exact subscription type values to use for all relevant Leads events.
2. Whether phone-number availability always arrives as a distinct notification or can only be observed by polling the lead payload.
3. Exact payload paths Yelp will use for verified direct phone numbers across lead types.
4. Ads API credential/onboarding model for future client rollouts.
5. Best-practice rules for partner-scale Ads API operations once Yelp sends the partner examples and clarification.

## Readiness Judgment

The current business onboarding path is controlled-pilot ready for selected businesses where admin access, subscription, webhook forwarding, reconcile, and thread-send proof are all verified.

It is not yet broad-client-rollout ready until Yelp confirms the Ads API credential model and the subscription/phone-update details above are validated across more than the current test business.
