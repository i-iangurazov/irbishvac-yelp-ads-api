# Autoresponder Module Summary

## What is now live

- A dedicated `/autoresponder` module now exists as the primary operational surface for first-response automation.
- The module centralizes:
  - tenant-level autoresponder enable/disable
  - Yelp-thread-first default mode
  - Yelp masked-email fallback policy visibility
  - AI draft assist enable/disable
  - template management
  - rule management
  - recent activity across sends, skips, failures, and AI draft usage
  - linked open failures from the operator issue queue
- The sidebar now includes `Autoresponder` in primary navigation because the page is operational enough to stand on its own.

## What moved out of settings or other pages

- The old autoresponder configuration block was removed from `/settings`.
- `/settings` now shows a concise summary card that links into the dedicated autoresponder module.
- The Leads page action now points to `/autoresponder` instead of `/settings#autoresponder`.
- The write routes remain the same under `/api/settings/autoresponder/...`; only the operator/admin surface changed.

## What remains intentionally out of scope

- Autonomous AI sending remains out of scope.
- AI draft review is still required and stays inside the lead reply flow.
- This is not a marketing automation builder, campaign system, or multi-step journey tool.
- The module does not add speculative settings that the current runtime cannot enforce.
- It does not replace the Audit queue for deep forensic review; it links to it when failures need more investigation.

## Whether it deserves primary navigation

Yes. The module now has:

- a clear operating-status summary
- centralized live configuration
- visible template and rule coverage
- recent activity visibility
- linked failure visibility

That is enough to justify a dedicated primary-nav entry without cluttering the product.

## Assumptions and limitations

- Only admins can edit autoresponder settings, rules, and templates. Operators can monitor the module.
- Yelp thread remains the preferred primary path; masked email is fallback-only and still depends on SMTP.
- AI assist configuration is tenant-level and env-backed for model selection.
- Recent activity is intentionally concise and not a full audit replacement.

## Manual QA steps

1. Open `/autoresponder` as an admin.
2. Confirm the top summary reflects current enabled state, primary channel, live rules/templates, and open issue count.
3. Toggle autoresponder enabled/disabled and save. Refresh the page and confirm the state persists.
4. Toggle AI draft assist and confirm the setting saves and reloads correctly.
5. Create or edit a Yelp-thread template and confirm save/cancel returns to `/autoresponder`.
6. Create or edit a rule, including a scoped location/service rule, and confirm it saves and returns to `/autoresponder`.
7. Confirm recent activity shows recent sends, skips, failures, or AI draft usage when records exist.
8. Confirm open autoresponder failures link into `/audit/issues/[issueId]`.
9. Open `/settings` and confirm autoresponder management is now summarized there instead of duplicated.
10. Open `/leads` and confirm the header action now routes to `/autoresponder`.
