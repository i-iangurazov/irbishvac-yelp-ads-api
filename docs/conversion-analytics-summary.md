# Conversion Analytics Summary

## What is now live

- Internal-derived conversion metrics from real `YelpLead` and CRM status data
- Report detail views that combine Yelp batch spend with internal outcomes
- Explicit source labels between Yelp-native and internal-derived metrics
- Unknown/unmapped buckets preserved in grouped reporting

## Current metric coverage

- total leads
- mapped leads
- booked
- scheduled
- job in progress
- completed
- close rate
- cost per lead
- cost per booked job
- cost per completed job

## What is partial

- Spend freshness depends on when Yelp reporting batches were last fetched.
- Won/lost visibility depends on the internal lifecycle statuses actually recorded.

## What remains out of scope

- live attribution claims
- unsupported Yelp conversion semantics
- executive vanity dashboards

## Manual QA

1. Ensure at least one report request is ready.
2. Ensure leads have internal lifecycle statuses.
3. Open `/reporting/{reportId}`.
4. Confirm spend and internal outcomes render with separate source labeling.
5. Export CSV and confirm the same source boundary carries through.
