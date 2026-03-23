## Suggested Subject
Yelp Ads API: exact request and exact response for two failed CPC create attempts

## Email Draft
Hi Yelp Support,

Per your request, below are the exact endpoints, request parameters, and raw responses we received from your system for two recent CPC create attempts.

Notes:
- We are redacting only the Basic Auth credential itself.
- Our integration sends the create-program parameters on a `POST` request as query parameters.
- Program creation is async, so each flow is:
  1. `POST /v1/reseller/program/create`
  2. Yelp returns a `job_id`
  3. We poll `GET /v1/reseller/status/{job_id}`

### Case 1: `BUSINESS_NOT_ACTIVE`

Business name:
`Plumbing Business Tester - Test 5`

Encrypted Yelp business ID:
`J9R1gG5xy7DpWsCWBup7DQ`

Create request correlation ID:
`85175fe4-e0a3-4e32-a144-508889d8a9e7`

Create request:

```http
POST https://partner-api.yelp.com/v1/reseller/program/create?business_id=J9R1gG5xy7DpWsCWBup7DQ&program_name=CPC&start=2026-03-18&currency=USD&budget=900000&is_autobid=true&pacing_method=paced&fee_period=CALENDAR_MONTH&ad_categories=plumbing
Authorization: Basic <redacted>
Accept: application/json
X-Correlation-Id: 85175fe4-e0a3-4e32-a144-508889d8a9e7
```

No request body.

Create response:

```json
{
  "job_id": "u4AckP4T9njyd_2lD2CrXg"
}
```

Status request:

```http
GET https://partner-api.yelp.com/v1/reseller/status/u4AckP4T9njyd_2lD2CrXg
Authorization: Basic <redacted>
Accept: application/json
```

The poll request also includes an `X-Correlation-Id` header, but that value is generated per poll attempt and is not persisted in our DB.

Status response:

```json
{
  "status": "REJECTED",
  "created_at": "2026-03-18T11:24:26+00:00",
  "completed_at": "2026-03-18T11:24:54+00:00",
  "business_results": [
    {
      "error": {
        "code": "BUSINESS_NOT_ACTIVE",
        "message": "ValidationError: This business cannot be accessed because it is removed from search."
      },
      "status": "REJECTED",
      "identifier": "J9R1gG5xy7DpWsCWBup7DQ",
      "identifier_type": "BUSINESS"
    }
  ]
}
```

### Case 2: `UNSUPPORTED_CATEGORIES`

Business name:
`Plumbing Business Tester - Test 4`

Encrypted Yelp business ID:
`e2JTWqyUwRHXjpG8TCZ7Ow`

Create request correlation ID:
`54869287-bf6b-4ca5-9ad9-ed44b5dfd8ef`

Create request:

```http
POST https://partner-api.yelp.com/v1/reseller/program/create?business_id=e2JTWqyUwRHXjpG8TCZ7Ow&program_name=CPC&start=2026-03-18&currency=USD&budget=150000&is_autobid=true&pacing_method=paced&fee_period=CALENDAR_MONTH&ad_categories=plumbing
Authorization: Basic <redacted>
Accept: application/json
X-Correlation-Id: 54869287-bf6b-4ca5-9ad9-ed44b5dfd8ef
```

No request body.

Create response:

```json
{
  "job_id": "CknXixWUH18zAmFXnF0T0A"
}
```

Status request:

```http
GET https://partner-api.yelp.com/v1/reseller/status/CknXixWUH18zAmFXnF0T0A
Authorization: Basic <redacted>
Accept: application/json
```

The poll request also includes an `X-Correlation-Id` header, but that value is generated per poll attempt and is not persisted in our DB.

Status response:

```json
{
  "status": "REJECTED",
  "created_at": "2026-03-18T09:01:24+00:00",
  "completed_at": "2026-03-18T09:01:51+00:00",
  "business_results": [
    {
      "status": "REJECTED",
      "identifier": "e2JTWqyUwRHXjpG8TCZ7Ow",
      "update_results": {
        "program_added": {
          "error": {
            "code": "UNSUPPORTED_CATEGORIES",
            "message": "This business does not qualify for Yelp advertising because it is in an advertising restricted category (e.g. landmarks, airport terminals)."
          },
          "status": "REJECTED",
          "requested_value": {
            "start": {
              "error": {
                "code": "PARENT_WAS_REJECTED",
                "message": "This item's parent was rejected, and as a result this item was also rejected."
              },
              "status": "REJECTED",
              "requested_value": "2026-03-18"
            },
            "budget": {
              "error": {
                "code": "PARENT_WAS_REJECTED",
                "message": "This item's parent was rejected, and as a result this item was also rejected."
              },
              "status": "REJECTED",
              "requested_value": "150000"
            },
            "currency": {
              "error": {
                "code": "PARENT_WAS_REJECTED",
                "message": "This item's parent was rejected, and as a result this item was also rejected."
              },
              "status": "REJECTED",
              "requested_value": "USD"
            },
            "fee_period": {
              "error": {
                "code": "PARENT_WAS_REJECTED",
                "message": "This item's parent was rejected, and as a result this item was also rejected."
              },
              "status": "REJECTED",
              "requested_value": "CALENDAR_MONTH"
            },
            "is_autobid": {
              "error": {
                "code": "PARENT_WAS_REJECTED",
                "message": "This item's parent was rejected, and as a result this item was also rejected."
              },
              "status": "REJECTED",
              "requested_value": "true"
            },
            "program_name": {
              "error": {
                "code": "PARENT_WAS_REJECTED",
                "message": "This item's parent was rejected, and as a result this item was also rejected."
              },
              "status": "REJECTED",
              "requested_value": "CPC"
            },
            "ad_categories": {
              "error": {
                "code": "PARENT_WAS_REJECTED",
                "message": "This item's parent was rejected, and as a result this item was also rejected."
              },
              "status": "REJECTED",
              "requested_value": [
                {
                  "error": {
                    "code": "PARENT_WAS_REJECTED",
                    "message": "This item's parent was rejected, and as a result this item was also rejected."
                  },
                  "status": "REJECTED",
                  "requested_value": "plumbing"
                }
              ]
            },
            "pacing_method": {
              "error": {
                "code": "PARENT_WAS_REJECTED",
                "message": "This item's parent was rejected, and as a result this item was also rejected."
              },
              "status": "REJECTED",
              "requested_value": "PACED"
            },
            "yelp_business_id": {
              "error": {
                "code": "PARENT_WAS_REJECTED",
                "message": "This item's parent was rejected, and as a result this item was also rejected."
              },
              "status": "REJECTED",
              "requested_value": "e2JTWqyUwRHXjpG8TCZ7Ow"
            }
          }
        }
      },
      "identifier_type": "BUSINESS"
    }
  ]
}
```

If useful, I can also send the same information as a HAR-style summary or include additional failing job IDs from the same account.

Thanks.
