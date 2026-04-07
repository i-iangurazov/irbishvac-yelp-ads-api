# Live System UX Review

## What now feels coherent

- Leads is part of the live navigation rather than a beta footnote.
- Dashboard acknowledges live lead operations instead of only Ads and reporting.
- Settings no longer frames live credentials as a staged MVP concept.
- Reporting, automation, and audit flows already share a consistent dense operator style.

## What still needs attention

### Product-language issues

- Some older docs still describe parts of the app as slices or post-MVP work even though the code is now live.
- “Fusion” still exists as an internal enum name even though the UI now correctly explains it as a bearer token.

### UI consistency issues

- Dashboard is useful, but still slightly more summary-oriented than queue-oriented.
- Secondary routes like Integrations, Locations, and Services still read as internal diagnostic screens.
- Raw JSON and debug blocks are functional but still visually utilitarian.

### Operator trust issues to keep explicit

- Yelp reporting remains delayed batch data.
- Webhook deployment and Yelp-side subscription setup remain external dependencies.
- SMTP remains an operational dependency for delivery and autoresponder.
- CRM sync is live through internal routes and operator workflows, but not through a dedicated connector daemon.

## Recommended next tightening pass

1. Keep secondary routes visually de-emphasized.
2. Add more compact cross-links between dashboard, leads, and audit.
3. Continue removing internal implementation jargon from user-facing copy.
4. Keep every source boundary badge and freshness label visible where data types mix.
