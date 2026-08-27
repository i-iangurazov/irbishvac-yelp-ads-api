# Yelp Keyword API Validation

Validation date: 2026-08-27 (Pacific Time)

## Conclusion

The current Ads API connection is healthy, and the live Yelp Program List confirms that four current CPC programs support `NEGATIVE_KEYWORD_TARGETING`. The keyword feature itself cannot yet be retrieved or changed through the integration because the Program Feature API call is not succeeding with the Ads API credential, while Yelp's documentation requires the credential used for the Data Ingestion API. No separate Data Ingestion credential is currently configured for the tenant.

This is an access/credential blocker, not an unverified program-ID assumption and not a missing query parameter in the documented GET request.

The public Partner API contract supports blocked search terms through `NEGATIVE_KEYWORD_TARGETING`. It does not document an API for the Yelp Business UI's Boosted Keywords list or estimated-audience gauge.

## Read-only production test

The diagnostic performed only GET requests. It did not call POST or DELETE and did not modify any live Yelp campaign or keyword setting.

### Control request

- API: Yelp Ads Program List
- Authentication: current Ads API Basic Auth
- Result: HTTP 200
- Confirmed current CPC programs: 4
- `NEGATIVE_KEYWORD_TARGETING` advertised as available: 4 of 4
- `NEGATIVE_KEYWORD_TARGETING` advertised as active: 2 of 4

This proves that the Ads credential is valid, the four program IDs exist in Yelp, and Yelp advertises the feature for those programs.

### Program Feature request

- Method: `GET`
- Endpoint: `https://partner-api.yelp.com/program/{program_id}/features/v1`
- Path parameter: confirmed live Yelp `program_id`
- Query parameters: none
- Request body: none
- Authentication tested: current Ads API Basic Auth
- Result: HTTP 400 for all four confirmed current programs
- Provider error code: none returned

The application previously converted upstream HTTP 400 to local HTTP 422. That error-normalization bug has been corrected, and automated tests now prove that 400 and 422 remain distinct.

### Required credential path

Yelp's Program Feature guide states that Program Feature API uses Basic HTTP Authentication and that credentials used for the Yelp Data Ingestion API must be used. Our application now selects the tenant's encrypted `DATA_INGESTION` credential for Program Feature operations. That credential is not yet configured, so no write should be attempted until Yelp enables/provides it and the read test succeeds.

## What is and is not supported by the public contract

Supported:

- Retrieve program features with GET.
- Set/update `NEGATIVE_KEYWORD_TARGETING.blocked_keywords` with POST.
- Clear the feature with DELETE.
- Add custom blocked terms outside Yelp's suggested list.
- Retrieve up to 25 non-exhaustive suggested terms when Yelp returns them.

Not documented:

- Boosted Keywords management.
- Positive keyword bids.
- Estimated audience size.
- GET query parameters for keyword retrieval.

The only documented input to the GET request is the `program_id` path parameter. The configurable keyword value is the POST body field `NEGATIVE_KEYWORD_TARGETING.blocked_keywords`.

## Safe verification after Yelp enables access

1. Configure the Yelp-provided Data Ingestion / Program Feature Basic Auth credential for the tenant.
2. Run GET against one Yelp-approved test program and preserve the current blocked list.
3. Confirm the response contains `NEGATIVE_KEYWORD_TARGETING`.
4. With Yelp's approval, POST either the unchanged list as a no-op or one approved temporary blocked term.
5. GET the feature again and verify exact read-back.
6. Restore the original list if the test changed it, then perform a final GET.
7. Record timestamps, HTTP statuses, program ID and Yelp/provider request identifiers in the audit log.

## Send-ready email

**Subject:** Program Feature API access needed for Yelp keyword management

Hi [Name],

Thank you for speaking with us. We completed a read-only production validation and isolated the blocker affecting keyword management.

What is working:

- Our current Yelp Ads API Basic Auth is valid: Program List requests return HTTP 200.
- We confirmed four current live CPC program IDs directly from Yelp.
- Yelp's Program List reports `NEGATIVE_KEYWORD_TARGETING` in `available_features` for all four programs, and in `active_features` for two of them.

What is failing:

- We called `GET https://partner-api.yelp.com/program/{program_id}/features/v1` for each confirmed live program.
- The request contained the documented `program_id` path parameter, no query parameters and no request body.
- Each request returned HTTP 400 when authenticated with our existing Ads API Basic Auth credentials. No machine-readable provider error code was returned.
- We did not call POST or DELETE, so no production keyword settings were changed.

Yelp's Program Feature API documentation says that the credentials used for the Data Ingestion API must be used for this endpoint, and that Partner API access requires separate enablement. We currently have working Ads API credentials but do not have a separate Data Ingestion / Program Feature credential configured.

Could you please help us confirm the following?

1. Is Program Feature API access enabled for our partner account and these payment programs?
2. Should we receive a separate Data Ingestion / Program Feature Basic Auth username and password? If so, please enable or provide that credential through the approved secure channel.
3. Is `GET /program/{program_id}/features/v1` the correct endpoint for these Program List IDs, with no additional header or parameter required?
4. Can the Partner API manage only blocked keywords through `NEGATIVE_KEYWORD_TARGETING`, or is there also an API for the Boosted Keywords and estimated-audience controls visible in Yelp for Business?
5. What are the production limits and matching rules for `blocked_keywords` (maximum terms, term length, normalization and match behavior)?
6. Can you provide a sandbox/test program, or approve a controlled no-op/read-back test after access is enabled?

We can provide the four affected program IDs and request timestamps directly in a secure reply if needed for log tracing.

Best,

Ilias

## Official references

- [Program Feature API guide](https://docs.developer.yelp.com/docs/program-feature-api)
- [Retrieve Program Feature](https://docs.developer.yelp.com/reference/retrieve_program_feature)
- [Add Program Feature](https://docs.developer.yelp.com/reference/add_program_feature)
- [Program Features Reference](https://docs.developer.yelp.com/docs/program-features-reference)
- [Yelp Partner API access](https://docs.developer.yelp.com/docs/yelp-partner-apis)
