# Monitoring Thresholds

## Purpose

These thresholds are tuned for a controlled pilot. They are intentionally simple and operational, not enterprise-observability theater.

Use them to decide when to:

- watch
- investigate same day
- pause rollout

## 1. Webhook lag thresholds

Definition:

- time from Yelp delivery to successful local processing / visible queue entry

Thresholds:

- Green:
  - under 10 minutes
- Yellow:
  - 10 to 30 minutes
  - or 2 consecutive failed webhook deliveries for the same business
- Red:
  - more than 30 minutes
  - or 5 failed deliveries in a row
  - or no new webhook processing for an actively receiving pilot business during expected volume

Escalation guidance:

- Yellow: operator reviews `/audit` same day
- Red: technical owner investigates immediately; consider narrowing rollout or using manual recovery until fixed

## 2. Follow-up execution lag thresholds

Definition:

- difference between due time and actual follow-up execution time for eligible follow-ups

Thresholds:

- Initial autoresponder:
  - Green: under 5 minutes
  - Yellow: 5 to 15 minutes
  - Red: over 15 minutes
- 24-hour and 7-day follow-ups:
  - Green: under 30 minutes past due
  - Yellow: 30 minutes to 2 hours past due
  - Red: over 2 hours past due without a clear working-hours requeue reason

Escalation guidance:

- Yellow: verify `/api/internal/autoresponder/followups` and cron
- Red: pause affected business autoresponder if sends are stuck or late in a pattern

## 3. Failed send thresholds

Definition:

- failed initial or follow-up autoresponder attempts

Thresholds:

- Green:
  - isolated single failure with successful retry path
- Yellow:
  - 3 failed attempts in 24 hours for one business
  - or failure rate over 10% for the last 20 attempts
- Red:
  - 5+ failed attempts in 24 hours for one business
  - or failure rate over 20% for the last 20 attempts
  - or duplicate sends observed

Escalation guidance:

- Yellow: review config, thread eligibility, and queue issues same day
- Red: disable autoresponder for the affected business until root cause is understood

## 4. Unmapped lead thresholds

Definition:

- leads that remain unresolved for downstream mapping

Thresholds:

- Green:
  - under 10% of active pilot leads unresolved for more than 1 business day
- Yellow:
  - 10% to 25%
  - or more than 5 unresolved leads older than 1 business day
- Red:
  - over 25%
  - or more than 10 unresolved leads older than 1 business day

Escalation guidance:

- Yellow: review mappings and connector health within 1 business day
- Red: do not expand pilot scope until mapping health improves

## 5. Report delivery failure thresholds

Definition:

- failed schedule runs or recipient-group sends

Thresholds:

- Green:
  - isolated failed run with successful resend
- Yellow:
  - 1 failed run for a scheduled report that is still awaiting resend
  - or 2 failed recipient groups in 7 days for the same schedule
- Red:
  - 2 consecutive failed runs for the same schedule
  - or any widespread routing error that sends wrong scope to wrong recipients

Escalation guidance:

- Yellow: review recipient routing and SMTP same day
- Red: disable affected schedule until corrected

## 6. Escalation matrix

### Green

- continue pilot
- monitor normally

### Yellow

- operator reviews same day
- technical owner reviews within 1 business day
- do not expand pilot scope while yellow items accumulate

### Red

- immediate investigation
- consider disabling autoresponder per business
- consider pausing affected schedules
- keep lead intake live if possible, but narrow automation scope
- do not broaden rollout until the red item is closed

## 7. Current pilot stance

Use these thresholds conservatively.

Because the system is still in controlled-pilot territory:

- a small number of yellow issues is acceptable
- repeated red issues mean rollout should pause, not just be “watched”
