# Conversion Analytics Plan

## Goal

Produce trustworthy conversion metrics from real lead outcomes, without blurring them with Yelp-native metrics.

## Inputs

- Yelp-native:
  - spend from stored reporting batches
  - lead identity and created date from Yelp intake
- Internal-derived:
  - CRM mapping state
  - internal lifecycle status

## Metrics

- spend
- total leads
- mapped leads
- cost per lead
- booked
- scheduled
- job in progress
- completed
- won/lost where supported by internal status
- conversion rates by stage
- cost per booked lead
- cost per completed job

## Aggregation rules

- Use lead cohort windows from the selected date range.
- Keep unknown and unmapped rows visible.
- Do not fabricate real-time attribution.
- Show freshness from the last stored Yelp batch snapshot.

## UX rules

- Label spend as Yelp-native delayed batch data.
- Label outcome metrics as internal-derived.
- Keep these metrics usable in both report detail and scheduled delivery output.

## Tests

- metric derivation
- cost calculations
- unknown bucket preservation
- filtered view shaping
