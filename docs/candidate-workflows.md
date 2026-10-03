# Candidate preparation workflows

The Workflows page automates candidate preparation from staff uploads, Telegram submissions, HR verification, or a manual start. The starting event is chosen when creating a workflow and can be edited in its starting step. AI extraction is optional; workflows reuse stored data and never make a paid extraction request.

## Configure and run

1. Open **Workflows → Create workflow** and choose a purpose preset or starting event.
2. Click a step to configure it. For **Assign forms**, choose published forms; legacy PDF templates also require their recipient role. New web forms assign the whole form to the candidate.
3. Draft changes autosave with revision checks. **Save draft** retries a failed save. Draft edits do not change the active published workflow.
4. Use the canvas **setup check** to find missing configuration or connections. Publish after resolving them; confirm the activation and preparation effects before publishing.
5. Submit or approve a CV according to the published starting event, or use **Run published workflow** for an existing CV. This is a real execution using the published version, not a dry run. The scheduled worker processes queued runs.
6. Open **Executions** to inspect progress and resolve review, account-reuse or delivery issues. CV approval lives in the Resume Editor; AI extraction remains optional and requires explicit confirmation.

Each resume can run once per workflow; retries continue that run. **Pause new automatic runs** disables new event-triggered executions without cancelling existing runs. Manual execution remains available for the published version.

## Editor and execution

- React Flow provides the full-width canvas, pan/zoom, minimap and connection handles. New purpose presets use a horizontal layout; existing workflows retain their saved positions until **Auto-arrange** is used.
- Use a node output **+** or an edge insertion button to add a connected step. Inserting preserves the previous target; new branching steps still need their remaining output configured. Search the **Add step** catalog and click or drag a step onto the canvas.
- Click nodes for immediate draft settings, input/output explanations and accessible connection selectors. On smaller screens settings open in a sheet. Drag output handles to inputs or reconnect existing edges; invalid rejection paths, occupied outputs and cycles are blocked.
- Undo/redo supports configuration, insertion, deletion and layout changes. Ctrl/Cmd+D duplicates selected steps; Delete removes them, while the starting node is protected. Shortcuts ignore text inputs. **Fit workflow** restores the canvas view.
- Publication validates the complete graph. Review gates, account reuse, pinned form versions and delivery confirmation remain enforced by the server. Individual preparation steps cannot be executed outside these gates.
- Execution details display a read-only copy of the run's published graph, with recorded step status, attempts, notes, and review/recovery actions. A completed preparation workflow does not mean the candidate has submitted forms; Telegram sent does not mean read.
- shadcn/ui supplies panels and controls; TanStack Form remains in CV review validation.
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

## Automation workspace

The editor separates **Draft saved**, **Unpublished changes**, and the **Live version**. The live starting event is shown independently from the draft event. **Review changes & publish** lists changed settings, steps, connections, annotations and positions. It checks other active workflows before enabling confirmation: every active workflow matching an event may run. Manual workflows do not share an automatic event. This warning does not reserve an event or change existing execution behavior.

**Focus mode** expands the editor beyond the application navigation. Catalog and settings panels can be closed without resetting the canvas view. **Find a step** searches names and annotations and centers the selected step. Each node has a visible actions menu and a right-click menu for configuration, duplication and removal; the starting node remains protected. Internal annotations and custom step names are part of the graph and its published snapshot, and are never sent to candidates.

The catalog groups Candidate, Forms, Communication and Logic tools, suggests a next step, and restricts rejected-review choices to Stop. Node cards summarize configured forms and conditions. **Parameters / Input / Output** in the draft distinguish configuration from actual execution evidence; sample testing provides planned results, while live results belong to executions.

### Sample testing

**Test with sample data** previews the current draft entirely in the browser. HR can change a sample name/email, CV source, position, approval decision, existing-account assumption and Telegram-confirmation assumption. The preview follows the configured condition/review path, lists planned forms and renders the invitation using supported name/email/form-count tokens.

No account, approval, assignment, activation capability, database record, message or paid AI call is created by this preview. It does not verify live account reuse, available forms, contact ownership or delivery. A sample approval cannot approve a real CV. Missing configuration is displayed and still blocks publication. Conditions retain their existing exact source/position comparison; arbitrary code and expression execution are not supported.

### Draft recovery

Incomplete invitation text can be saved as a draft, while publication continues to reject an empty message. All graph types, sizes and metadata limits remain validated. A failed save preserves entered settings. **Download my draft** exports workflow configuration and annotations; **Review latest version** compares the latest saved graph without replacing local edits. **Discard my edits and load latest** is explicit, resets undo history and uses the latest revision. There is no automatic overwrite or merge of concurrent edits.

### Executions and organization

On desktop, choosing an execution opens an inline workspace with the filtered run list, read-only published graph and step inspector. Smaller screens use a details sheet. **Focus current step** centers the waiting/failed/current node. Parameters show the saved configuration; Input and Output show available CV/version references, approved candidate name, pinned forms, result, attempts, recorded branch and notes. Links open the relevant CV, candidate or accounts. No credentials or activation capabilities are exposed.

New executions record condition and review outcomes. Older executions without outcome evidence keep unknown branches neutral and explicitly identify missing recorded outcomes. Recorded completion remains separate from candidate form submission or Telegram read status. Existing retry, return-to-review, contact confirmation and uncertain-delivery checks are preserved.

The workflow overview includes name search, Active/Paused/Draft and starting-event filters, matching/overall counts, clear-filter actions, latest execution status and direct execution links. Filters use the existing URL/session preference helper scoped to the authenticated owner. **Duplicate as draft** copies the saved draft and annotations into an inactive version-zero workflow with no published graph or execution history. It never activates an additional automation.

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

Workflow creation offers purpose presets for preparing after CV approval, receiving a Telegram CV for HR review, and starting preparation manually. The Telegram review preset ends after the approved review and creates no account or form assignments. Preparation presets include the guarded account, CV link, form and Telegram steps; HR chooses forms before publishing. Saving CV edits does not approve or start a workflow. Explicit Approve CV does and warns that published approval workflows may start.

## Automation readiness and history (shipped October 2026)

- Draft readiness appears in Settings and publication review; manual execution checks the published snapshot before enabling Start. Checks inspect published/archived forms, pinned versions and required bot configuration without contacting Telegram or running AI. Candidate contact still needs explicit HR confirmation. Automatic events keep their existing guarded execution behavior.
- Settings lists published snapshots and previews differences before an explicit restore to draft. Restore uses owner and revision checks, saves current edits first and leaves the live publication, activation and existing executions intact. Forms are revalidated and repinned on the next publication. Migration `0028_workflow_publish_history.sql` backfills only the latest existing publication; older snapshots cannot be reconstructed. Its publication trigger records future snapshots in the same transaction as the workflow update.
- Execution search, status and date filters persist per owner and workflow via URL/session storage. Clear filters resets them.
- Execution details emphasize the candidate and next action. Technical IDs and archive controls appear under More execution actions. HR review has no timeout; Telegram confirmation and retry waits are distinguished. New step-start timestamps support elapsed waiting time; legacy records without evidence show no invented duration. Over 15 minutes without a processing update shows a cautious delay notice, not a failure claim.

## Guided workflow setup (shipped October 2026)

New workflow opens `/workflows/new`: Purpose → Forms → Readiness → Sample preview → Review & publish. Choose a standard purpose, name the workflow and select published forms. Saving creates an inactive draft; Save draft for later allows unfinished form choices. Saved draft cards offer Continue guided setup. The draft ID in the URL supports reloading; sample acknowledgement is deliberately not persisted. Refreshing forms preserves current name and choices. Legacy PDF forms retain their role selection.

Readiness checks cover invitation and Telegram intake bot configuration, selected forms and required versions. A sample preview is local only; HR can explore approval, rejection and missing contact without external calls. Review checks other active workflows with the same event, requires sample acknowledgement and readiness, then explicitly confirms publication. The guide rechecks readiness immediately before publishing and uses the existing owner/revision-guarded publication API. Publication pins forms and activates future events; it does not process historical CVs.

Advanced canvas setup remains available. Published, archived or customized drafts continue in the editor; the guide never rebuilds custom graph edits from a preset. Draft edits require an explicit save and retain unsaved-change protection.
