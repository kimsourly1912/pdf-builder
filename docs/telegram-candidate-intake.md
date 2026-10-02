# Telegram candidate intake

Share `https://t.me/anghr_bot` through Messenger, LinkedIn, or Telegram. The candidate starts a private conversation and provides their full name, email address, and PDF CV. The bot stores the contact and original PDF in Candidate intake and the Resume Library. Uploading creates neither a login account nor an AI request, and does not start a workflow.

## HR process

1. Open **Candidate intake**, preview the CV, and confirm **Extract with AI** when paid extraction is needed. Successful extraction is reused by the workflow. Re-extraction requires another confirmation. Failed extraction remains visible and can be retried explicitly.
2. Publish a workflow with **Review resume → Create candidate account → Link resume → Assign forms → Send Telegram invitation → Complete**. The Telegram step has an editable plain-text message with `{name}`, `{email}`, and `{formCount}` placeholders.
3. Start the published workflow from the extracted intake. Review the CV and contact details, resolve any duplicate candidate link, and explicitly confirm the Telegram contact. Matching email alone does not authorize reuse of an existing account.
4. Approve the review. The workflow creates or explicitly reuses the login account, links the CV, assigns the selected forms, and sends the invitation. Rejection performs none of these actions. Missing contact or bot configuration pauses delivery; HR can connect a contact from the run details without repeating account creation or assignments.
5. New candidates receive a one-time activation button, set their own password, and continue to their forms. The link expires after 24 hours. Existing account holders receive a sign-in button. The invitation includes the email address; no temporary password is sent or exposed to HR for Telegram workflows.

The intake list searches and filters the most recent 200 submissions. The Resume Library's extraction action directs Telegram CVs to their intake confirmation screen.

## Production configuration

`TELEGRAM_BOT_USERNAME=anghr_bot` is configured in Wrangler. Add these secrets to the GitHub production deployment environment, never to source control or chat:

- `TELEGRAM_BOT_TOKEN`: the BotFather token for `@anghr_bot`.
- `TELEGRAM_WEBHOOK_SECRET`: a randomly generated secret of 16–256 characters using letters, digits, `_`, or `-`.

The existing `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, and `MANAGEMENT_EMAIL` settings are required for activation, public links, and owner-scoped intake. Paid extraction also requires the existing OpenAI configuration.

When both Telegram deployment secrets are present, deployment verifies the bot username, installs the Worker secrets, and registers `/api/telegram/webhook` with Telegram's secret header and message-only updates. Pending Telegram updates are preserved. If either deployment secret is absent, registration is skipped and existing Worker secrets are preserved. A successful application deployment alone does not demonstrate a working live Telegram connection.

The webhook accepts only authenticated private messages. Requests are durably queued in D1 before acknowledgement, deduplicated by update ID, and processed in chat order with leases. Worker background processing handles new requests promptly; the production scheduled handler also drains the inbox and resumes workflows. PDFs use the existing 15 MB / 20-page checks. Uploaded email is self-reported, not email verification.

## Delivery and activation safeguards

Deliveries are recorded per run and step with a stable private chat ID. Telegram rate limits defer retries. Network failures or ambiguous send responses are marked **uncertain**, since Telegram may already have accepted the message. HR must confirm an explicit resend after checking with the candidate. Successful sends are not proof that a candidate read the message.

Resends retain the approved account and form assignments. An unused expired activation link can be replaced during a resend; an activated account receives a normal sign-in link. Sent invitations cannot silently be redirected to a different chat. Activation redemption checks the account, owner, expiry, and unused token in one database transaction. Token hashes are stored separately from encrypted delivery tokens; redemption clears the encrypted token and invalidates prior sessions.

## Validation

Run the repository's local migrations, lint, typecheck, and `npm test`. Telegram integration tests use SQLite transactions and mocked Telegram/OpenAI calls to exercise intake without AI, explicit extraction and failure handling, review approval/rejection, multiple mapped forms, uncertain delivery, rate limits, contact connection, resend, and single-use activation. They never send real Telegram messages.
