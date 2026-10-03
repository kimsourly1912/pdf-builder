# Reset production for end-to-end testing

This procedure clears the live app, not local development. Use it only when the user explicitly requests deletion of the production test data. Ordinary record removal continues to use Archive.

## What changes

- All application rows, including accounts, CVs, candidates, templates, submissions, workflows, Telegram intake, jobs, and audit history are cleared.
- D1 schema, migration history, indexes, and protection triggers are retained.
- All objects in the application's private R2 bucket are deleted.
- Pending AI queue messages and Telegram updates are discarded; no messages are sent.
- The next normal deployment recreates `admin@gmail.com` using the production owner-password secret and registers the Telegram webhook.

The app uses a minimum eight-character authentication password following the requested test-admin setup. Candidate activation and staff-managed recipient credential screens retain their separate stronger validation. Do not put an actual password in this document or in workflow inputs.

## Run

1. Set GitHub's production environment secret `PDF_BUILDER_OWNER_PASSWORD` to the desired admin password (8–128 characters). Keep the Cloudflare, OpenAI, and Telegram deployment secrets configured.
2. Open **Actions → Deploy production → Run workflow**, selecting `codex/pdf-studio-self-host`.
3. Enter exactly `RESET pdf-builder PRODUCTION` in the optional `reset_confirmation` field. Leaving this field empty runs an ordinary deployment without clearing data.
4. Wait for validation, reset, deployment, authenticated smoke checks, and Telegram webhook registration to finish. Check the run for the exact branch/commit.
5. Sign in using the configured admin credentials and start the candidate flow from an empty application.

The reset shares the production deployment concurrency lock. Its script refuses execution outside GitHub Actions or without the exact confirmation and required credentials. Preflight checks verify the existing resources and bot. A temporary maintenance Worker blocks application requests and scheduled work while the reset runs. A random reset secret authorizes its operations and is removed afterward; the reset endpoint is absent from the normal application Worker.

The D1 reset removes children before parents and drops/restores triggers within one database batch. It checks that all application tables are empty and protections restored before clearing files. Local tests exercise authorization, preserved migrations/protections, dependency ordering, and file cleanup with mocks.

## Failure and recovery

D1 reset and R2 deletion are not one distributed transaction. If reset fails after maintenance is installed, the app stays in maintenance mode and the workflow reports failure. Inspect the failed operation and rerun the reset job after correcting it. File deletion and the database reset can safely repeat while still in maintenance; deployment then recreates the admin.

If deployment fails after reset, the data may already be gone. Fix the deployment failure and rerun it; do not describe that as a successful reset until owner sign-in and the normal application are verified. A later reset discards any new test records, so do not rerun a successful reset after starting a new test session.
