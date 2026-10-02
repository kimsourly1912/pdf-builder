# Candidate preparation workflows

The Workflows page automates candidate preparation from staff uploads, Telegram submissions, HR verification, or a manual start. The starting event is chosen when creating a workflow and can be edited in its starting step. AI extraction is optional; workflows reuse stored data and never make a paid extraction request.

## Configure and run

1. Open **Workflows → Create workflow** and choose its starting event.
2. Select **Assign forms**, add templates and their recipient roles, and apply
   the step settings. Existing template resume mappings supply the autofill.
3. Save a draft or publish the workflow. Publication enables the selected starting event.
4. Submit or verify a CV according to the selected event, or start the workflow manually. The scheduled worker processes queued runs.
5. Open **Runs → Review CV**. Compare the PDF with extracted data, correct the
   fields, and complete the review checklist. Resolve duplicates in the Resume
   Library before approval.
6. Confirm an existing candidate account or set and save a temporary password
   for a new account. Share credentials through the existing staff process.
7. Approve to create/use the account, link the approved CV, and assign the forms.
   Rejecting requires a reason and ends the workflow without those actions.

**Start with existing CV** runs the published workflow on a stored resume. Each
resume can run once per workflow; retries continue that run. **Pause new runs**
disables future upload triggers and does not stop existing runs.

## Editor and execution

- React Flow provides dragging, connection handles, zoom, and the canvas.
- shadcn/ui supplies panels and form controls; TanStack Form manages editor
  settings and CV review validation.
- Supported steps: purpose-based starting event, optional resume preparation, HR review, candidate account,
  resume link, form assignment, conditions, complete, and stop.
- Conditions compare resume source or applied position with an exact value,
  ignoring whitespace and letter case. Connect both branches.
- Publication rejects disconnected graphs, loops, missing branches, duplicate
  form selections, and any account/assignment path that bypasses approval.
- D1 stores drafts, published versions, run progress, and review decisions.
  This implementation uses the existing Worker scheduled handler as its runner.
- Upload trigger rows are inserted in the same D1 batch as the uploaded CV.
- Runs snapshot the published graph, template versions, approved profile, and
  candidate values. Later edits cannot change those snapshots.
- Worker leases prevent simultaneous execution. Interrupted running leases can
  resume after ten minutes. Known failures wait for staff to retry the failed
  step; completed steps and previously created assignments are preserved.
- Account creation and its progress checkpoint commit in one D1 batch. A unique
  account email and unique assignment/version/role constraints prevent duplicates.
- Review revision guards abort an entire batch if the CV, candidate, owner, or
  worker lease changed. Two reviewers cannot approve the same run concurrently.
- Temporary passwords use Better Auth's existing default hashing format. Only
  a hash is persisted; it is cleared after account creation. It is never included
  in run API responses, review notes, or audit metadata.

## Permissions and recovery

The current workspace owner authorization protects every workflow and run API.
Separate HR teams and reviewer routing are not introduced in this version.

An email match alone never authorizes reuse of an account: staff must explicitly
confirm the owner-scoped candidate account, and it must not be linked to another
candidate. Existing account passwords are preserved.

For an account-creation conflict, choose **Return to review**, resolve the account
details, and approve again. For CV-data problems, edit and verify the CV in the Resume Editor; optional paid extraction can help but is never required. Removed or archived
resources produce an actionable failure and retain run history.

## Install and validate

Install the added dependencies and refresh the npm lock before committing:

```sh
npm install
npm run db:migrate:local
npm run lint
npm run typecheck
npm test
```

Migration `0019_candidate_workflows.sql` adds the workflow tables and review
revision guard. Migration `0020_workflow_execution_guards.sql` protects account,
resume-link, and assignment batches against expired or replaced worker leases.
Migration `0022_archive_and_submission_choices.sql` adds central archive retention, bot CV choices and guarded manual verification. See [Telegram intake](telegram-candidate-intake.md) and [Archive](archive.md).
Unexpected database errors use a safe staff-facing message; account progress is
recorded only after its transaction succeeds. The production deployment script applies D1 migrations
before publishing the Worker. Pushing a validated commit to
`codex/pdf-studio-self-host` triggers the existing production deployment workflow.

The tests cover graph safety, draft normalization, conditions, migration
compatibility, duplicate runs, stale-review rollback, ownership/lease checks,
error redaction, and retaining history after resume removal. Deployment verification
also checks the authenticated Workflows page and workflow list/run APIs without
creating or changing production candidates.
