# Test data reset

Open **Administration → Test data reset** in the sidebar. This is a permanent staging cleanup path, separate from regular Archive. Preview a category, check its counts, and type `DELETE TEST DATA` to enable deletion. No deletion occurs when opening the page or previewing.

- **Clear candidates:** clears owned candidate records, all owned CVs and intake, candidate recipient accounts and their linked forms, workflow runs and invitations. Employee accounts, templates, workflows and AI field-detection history stay.
- **Clear forms and preparation history:** clears all owned form links, assignments, response drafts, submissions/corrections, workflow runs and invitations/activation links. Candidate accounts, approved CV snapshots and definitions stay. Candidate progress is refreshed from the remaining evidence.
- **Clear eligible automation history:** clears finished/failed runs without prepared account or invitation evidence. Dependent runs remain until a broader reset is selected.
- **Reset all test data:** clears recipient accounts (candidate and employee), application records, AI history, archive records and previous activity. By default it retains templates and workflow definitions, including their archive state; uncheck the option to remove definitions and published versions too.

The management administrator, password, session and integration/secret settings are preserved. Minimal reset receipts remain in Activity. Telegram messages already sent are not recalled. Old links to removed records stop working. Processed Telegram update IDs remain as anonymous receipts to stop provider redelivery from recreating old applications; contact details and message payloads are cleared. Future uploads and bot messages can create new records after completion.

## Deployment control

The server requires the exact runtime variable `TEST_DATA_RESET_ENABLED="true"`. The current deployment is treated as staging by the user and explicitly enables this flag in `wrangler.jsonc`; the existing Actions/environment name remains production. Disable/remove this flag before using that deployment for real HR data. The API remains owner-authenticated even when enabled; the POST route requires same-origin requests and exact typed confirmation.

## Atomic deletion and file cleanup

Preview fingerprints cover selected database rows and eligible stored-file references. The atomic D1 batch rechecks that preview, active work and references outside scope, captures row membership, deletes children before parents, writes durable R2 cleanup jobs and a minimal reset receipt, then removes its transient guard/targets. Checks use shallow statements and JSON aggregation to stay within Cloudflare D1 compound-query and expression-depth limits. A failed recheck or statement rolls back all database mutations and cleanup jobs. Regular evidence and append-only audit triggers remain enabled; the two delete exemptions apply only to explicitly selected, owner-scoped rows within that reset batch. Other deletion paths retain Archive protection.

Active processing blocks reset until it finishes. Foreign/shared references outside the selected scope block deletion instead of cascading into another workspace. Retained template versions and other live file references prevent shared PDFs from being queued for cleanup. Submitted images and saved-draft images are included. R2 deletion is a separate eventual operation: if it fails, database reset is still complete and scheduled cleanup retries. The completion message reports pending files accurately.

This is a staging convenience, not a backup/restore tool. Application reset does not purge Cloudflare infrastructure, secrets or database migrations.
