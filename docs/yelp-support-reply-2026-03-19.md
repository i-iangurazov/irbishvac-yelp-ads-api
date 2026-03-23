## Suggested Subject
Re: March 19 retry matrix for business `J9R1gG5xy7DpWsCWBup7DQ`

## Email Draft
Hi Chris,

I ran a broader set of live retries today against the same business after your note about switching it to Restaurants.

Summary:
- Explicit `ad_categories=restaurants` still ends in `UNSUPPORTED_CATEGORIES`
- Explicit `ad_categories=tradamerican` still ends in `UNSUPPORTED_CATEGORIES`
- Explicit `ad_categories=pizza` still ends in `UNSUPPORTED_CATEGORIES`
- Explicit `ad_categories=restaurants&ad_categories=pizza` still ends in `UNSUPPORTED_CATEGORIES`
- Literal `ad_categories=Restaurants` is invalid and returns `CATEGORY_ALIAS_NOT_RECOGNIZED`
- The only variant that completed successfully was omitting `ad_categories` entirely

So the current live behavior appears to be:
- this business can complete a CPC create if we do not send explicit `ad_categories`
- this business is still rejected when we send explicit category targeting, even for restaurant-related values

Here are the two most important exact examples.

### Successful create when `ad_categories` is omitted

Create request:

```http
POST https://partner-api.yelp.com/v1/reseller/program/create?business_id=J9R1gG5xy7DpWsCWBup7DQ&program_name=CPC&start=2026-03-19&currency=USD&budget=300000&is_autobid=true&pacing_method=paced&fee_period=CALENDAR_MONTH
Authorization: Basic <redacted>
Accept: application/json
```

Create response:

```json
{
  "job_id": "-8XYgJN8YpYWZ6vCrUjKJw"
}
```

Status response:

```json
{
  "status": "COMPLETED",
  "created_at": "2026-03-19T14:20:18+00:00",
  "completed_at": "2026-03-19T14:20:56+00:00",
  "business_results": [
    {
      "status": "COMPLETED",
      "identifier": "J9R1gG5xy7DpWsCWBup7DQ",
      "identifier_type": "BUSINESS",
      "update_results": {
        "program_added": {
          "program_id": {
            "requested_value": "5krjvTfbryy09MXo_t0Cyg",
            "status": "COMPLETED"
          }
        }
      }
    }
  ]
}
```

### Rejected create when `ad_categories=restaurants`

Create request:

```http
POST https://partner-api.yelp.com/v1/reseller/program/create?business_id=J9R1gG5xy7DpWsCWBup7DQ&program_name=CPC&start=2026-03-19&currency=USD&budget=300000&is_autobid=true&pacing_method=paced&fee_period=CALENDAR_MONTH&ad_categories=restaurants
Authorization: Basic <redacted>
Accept: application/json
```

Create response:

```json
{
  "job_id": "TFGqVcECRTnTZoxzeFxScg"
}
```

Status response:

```json
{
  "status": "REJECTED",
  "created_at": "2026-03-19T14:18:34+00:00",
  "completed_at": "2026-03-19T14:18:56+00:00",
  "business_results": [
    {
      "status": "REJECTED",
      "identifier": "J9R1gG5xy7DpWsCWBup7DQ",
      "identifier_type": "BUSINESS",
      "update_results": {
        "program_added": {
          "error": {
            "code": "UNSUPPORTED_CATEGORIES",
            "message": "This business does not qualify for Yelp advertising because it is in an advertising restricted category (e.g. landmarks, airport terminals)."
          },
          "status": "REJECTED"
        }
      }
    }
  ]
}
```

Question:

Should we treat this business as one where explicit `ad_categories` must be omitted, and let Yelp derive categories from the listing instead?

If helpful, I can also send the full raw receipts for all tested variants.

Thanks.
