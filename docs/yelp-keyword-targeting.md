# Yelp Search-Term Exclusions

## Supported production behavior

The console manages Yelp `NEGATIVE_KEYWORD_TARGETING` for one confirmed Yelp program at a time. This capability blocks unwanted search terms. It does not provide Google Ads-style positive keyword bids.

The provider workflow is:

1. Resolve the authenticated tenant and tenant-scoped local program.
2. Require a confirmed upstream Yelp program ID and an editable program state.
3. Require `programFeatureApiEnabled` and the tenant's encrypted `ADS_BASIC_AUTH` credential.
4. Read the current feature state from Yelp.
5. Send only the negative-keyword feature subset to Yelp.
6. Read the feature state from Yelp again.
7. Compare the normalized blocked-term set exactly.
8. Persist the verified snapshot and audit event only when read-back matches.

Clearing exclusions uses Yelp's feature DELETE contract and is also verified by a subsequent GET before local success is recorded.

## API contract

- Read: `GET /program/{programId}/features/v1`
- Update: `POST /program/{programId}/features/v1`
- Clear: `DELETE /program/{programId}/features/v1`
- Authentication: Yelp Partner API Basic authentication from the tenant's encrypted Ads credential

The update body contains only:

```json
{
  "NEGATIVE_KEYWORD_TARGETING": {
    "blocked_keywords": ["hvac jobs", "free hvac"]
  }
}
```

The clear body contains only:

```json
{
  "features": ["NEGATIVE_KEYWORD_TARGETING"]
}
```

## Operator setup

1. Yelp must enable Program Feature API access for the partner account.
2. Save and successfully test the tenant's Partner API Basic Auth credential in Admin Settings.
3. Enable `programFeatureApiEnabled` for that tenant.
4. Synchronize Yelp programs so each managed program has its canonical upstream program ID.
5. Open Programs, select a program, and open its Program Features view.

If Yelp does not return `NEGATIVE_KEYWORD_TARGETING` for that program, the console remains read-only and reports the feature as unsupported.

## Safety and audit behavior

- `features:read` is required to view the page.
- `features:write` is required for update or clear.
- Request payload tenant IDs are ignored; the authenticated tenant scope is authoritative.
- Terms are trimmed, whitespace-normalized, deduplicated case-insensitively, and length/count validated server-side.
- A provider mismatch records a failed audit event and does not create a local success snapshot.
- Every successful write records actor, tenant, business, local program, upstream program, provider correlation ID, before state, and verified after state.
- Demo mode is visibly labeled and never represented as a Yelp write.

## Yelp lifecycle limitation

Program features are attached to a specific Yelp program ID. If Yelp replaces a program, its feature configuration may not carry forward. The new program must be synchronized and its exclusions reviewed again.
