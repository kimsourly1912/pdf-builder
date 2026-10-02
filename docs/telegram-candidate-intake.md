# Telegram candidate intake

Share `https://t.me/anghr_bot` through Messenger, LinkedIn, or Telegram. The candidate starts a private conversation and provides their full name, email address, and PDF CV. The bot stores the contact and original PDF in Candidate intake and the Resume Library. Uploading creates neither a login account nor an AI request. A published workflow with the Telegram submission starting event can prepare the CV and wait for HR approval.

## HR process

1. Open **Candidate intake** for bot-provided contact details, CV preview, CV history and verification status. Each Telegram contact has one inbox row; additional CVs appear in its history.
2. Open the **Resume Editor**, enter or correct the candidate details, confirm their Telegram contact, save unfinished edits with **Save changes**, then explicitly **Approve CV** when ready. Paid AI extraction is optional and requires a separate confirmation in this editor. Neither submission nor a workflow makes a paid extraction request.
3. Publish a workflow with a clear starting event: staff upload, Telegram submission, HR verification, or manual start. Legacy workflows keep their staff-upload event. Use the HR-verification event for account, form and Telegram invitation automation after the editor review.
4. An approved intake shows contact and workflow requirements separately. Confirm contact directly from Intake, without sending an invitation. A published CV-approval workflow starts automatically on approval; existing preparations show View progress, Resolve issue or View completed preparation. When no preparation exists, HR can **Prepare candidate** manually. This reuses the editor approval without requiring a second CV review. Confirm contact ownership and explicitly approve reuse when an email already has an account. Changed CV/candidate revisions require a fresh review; duplicate candidate links must be resolved first.
5. The workflow creates or explicitly reuses the login account, links the CV, assigns forms and sends the Telegram invitation. Rejection creates no account or forms. Missing configuration pauses delivery; retry after fixing it preserves previous assignments and accounts.
6. New candidates receive a one-time activation button, set their own password, and continue to their forms. The link expires after 24 hours. Existing account holders receive a sign-in button. No temporary password is sent or exposed for Telegram workflows.

After submission, arbitrary messages or unsolicited PDFs do not create another intake. The bot offers `/add_cv` for an additional CV or `/replace_cv` to archive the latest unverified CV and store its replacement. Replacement of a verified CV is blocked; HR can use the archive and editor instead. Both choices retain the contact and candidate identity. No AI runs automatically.

## Production configuration

`TELEGRAM_BOT_USERNAME=anghr_bot` is configured in Wrangler. Add these secrets to the GitHub production deployment environment, never to source control or chat:

- `TELEGRAM_BOT_TOKEN`: the BotFather token for `@anghr_bot`.
- `TELEGRAM_WEBHOOK_SECRET`: a randomly generated secret of 16–256 characters using letters, digits, `_`, or `-`.

The existing `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, and `MANAGEMENT_EMAIL` settings are required for activation, public links, and owner-scoped intake. Paid extraction also requires the existing OpenAI configuration.

If the supplied webhook secret has an invalid length or contains unsupported characters, deployment generates a fresh random replacement and uses that same value in the Worker and Telegram webhook registration. The generated value is never logged. This does not modify the GitHub secret; future deployments will generate another replacement until the GitHub value is corrected.

When both Telegram deployment secrets are present, deployment verifies the bot username, installs the Worker secrets, and registers `/api/telegram/webhook` with Telegram's secret header and message-only updates. Pending Telegram updates are preserved. If either deployment secret is absent, registration is skipped and existing Worker secrets are preserved. A successful application deployment alone does not demonstrate a working live Telegram connection.

The webhook accepts only authenticated private messages. Requests are durably queued in D1 before acknowledgement, deduplicated by update ID, and processed in chat order with leases. Worker background processing handles new requests promptly; the production scheduled handler also drains the inbox and resumes workflows. PDFs use the existing 15 MB / 20-page checks. Uploaded email is self-reported, not email verification.

## Delivery and activation safeguards

Deliveries are recorded per run and step with a stable private chat ID. Telegram rate limits defer retries. Network failures or ambiguous send responses are marked **uncertain**, since Telegram may already have accepted the message. HR must confirm an explicit resend after checking with the candidate. Successful sends are not proof that a candidate read the message.

Resends retain the approved account and form assignments. An unused expired activation link can be replaced during a resend; an activated account receives a normal sign-in link. Sent invitations cannot silently be redirected to a different chat. Activation redemption checks the account, owner, expiry, and unused token in one database transaction. Token hashes are stored separately from encrypted delivery tokens; redemption clears the encrypted token and invalidates prior sessions.

## Validation

Run the repository's local migrations, lint, typecheck, and `npm test`. Telegram integration tests use SQLite transactions and mocked Telegram/OpenAI calls to exercise intake without AI, explicit extraction and failure handling, review approval/rejection, multiple mapped forms, uncertain delivery, rate limits, contact connection, resend, and single-use activation. They never send real Telegram messages.

Intake shows a single progress label and next action based on actual verification, preparation, delivery and required submissions. Telegram offers reply-keyboard buttons for Add another CV, Replace unreviewed CV and Check application status. Status never claims a sent invitation was read. CV history marks Latest submission, Currently viewing and Previously approved; workflow confirmation names the selected PDF.

Intake places one **Next step** summary above submitted contact details, with a primary action for the current requirement. Candidate Progress uses direct next-action links in both Kanban and List views. The Resume Editor displays Saved or Unsaved changes, warns before leaving an unsaved draft or replacing it through AI/linking/archive, and prevents editing during a save.
