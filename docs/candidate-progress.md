# Candidate progress

Open **Candidates → All candidates** to follow CV review, candidate preparation and form completion. Telegram intake is available under **Candidates → New submissions**. Progress groups active CVs by candidate; receiving another CV does not create another card for an existing candidate.

The Kanban and List views show the same data. The view preference is saved for each HR account in the current browser. Search supports name, email, Telegram username and CV filename. Stage and Needs attention filters apply to both views. Pages contain up to 50 candidates; column totals cover all matching candidates. A partial column shows its visible count and a shortcut to that stage’s candidates. Search, stage, attention, sorting and page filters are stored in the URL and remembered per HR account for the browser session, including after returning from detail. Clear filters resets the saved selection. Data refreshes every 15 seconds and when the window regains focus.

## Stages and safeguards

| Stage          | Meaning                                                                                                                    |
| -------------- | -------------------------------------------------------------------------------------------------------------------------- |
| New            | The selected CV has not been verified or started review.                                                                   |
| Reviewing CV   | HR started reviewing, or a workflow is waiting for review.                                                                 |
| CV approved    | The current CV and candidate information were verified in the Resume Editor. AI extraction is optional.                    |
| Awaiting forms | Preparation completed for the approved CV, all required forms were assigned and any required Telegram invitation was sent. |
| Forms to review | Preparation completed and every required form was actually submitted; HR acceptance is still pending.                                                      |
| Documents accepted | HR accepted every required submitted form; this is not a hiring decision. |

Drag a Kanban card or use its **Move to…** menu. Moving forward cannot substitute for CV verification, workflow preparation, a required invitation or form submission. When an action is missing, the dialog links to the relevant screen. Backward moves require a reason, record an audit event and preserve existing CV approval, accounts, invitations and submissions. Actual progress is shown alongside a manually overridden HR stage. New underlying activity recalculates the stage.

## Candidate detail

The candidate profile organizes information into Overview, CV & documents, Forms, Communication and History tabs. See [HR workspace](hr-workspace.md) for manual assignment and review/correction behavior. Completed forms link to their submission PDF when available. The timeline records CV receipt, approval, workflow preparation, Telegram delivery, submissions, stage changes and selection changes. “Invitation sent” means the delivery succeeded; it does not claim that the candidate read the message.

Preview any CV without changing selection. Choose a CV explicitly for a new preparation. Existing preparation remains associated with its original CV. Preparation history includes older and archived runs; archived CVs and runs cannot be selected. If the selected CV is archived, another active CV is selected. Candidates with no active CV are excluded from Progress and remain accessible through Archive. Changing the approved CV after preparation requires preparing against the current approval before marking that preparation ready.

## Implementation and validation

Migration `0023_candidate_progress.sql` stores HR stage and CV/run selections. Actual approval, preparation, invitation and submission states come from existing records. Owner checks scope every API read and mutation. Revision checks and a D1 batch guard reject concurrent changes instead of overwriting them. Progress mutations never extract a CV, create a login, send Telegram messages or submit a form.

Integration coverage exercises owned access, stale updates, concurrent form changes, manual CV verification, real form submissions, multiple CVs, archive handling and backward moves. Browser validation covers actual dragging, guarded transitions, Resume Editor approval, saved List preference, CV selection, the timeline and mobile menus.

## Waiting time and issue resolution

Choose Recent activity, Longest waiting first, or Newest CV first. The waiting label uses the selected CV receipt, current approval, recorded start of review, first preparation completion, last required form completion, or explicit HR stage-change event. Activity updates, retries and selection metadata updates do not reset that clock. Legacy records without a reliable start timestamp show “start time unknown” and sort after candidates with known waiting times.

Issue notices include actions for the affected CV, selected preparation, Telegram connection, or owned account. Account links open the matching account and its assignment details. Failed workflow steps explain the requirement to fix before retrying; Telegram uncertainty still requires checking before resending. Shared labels and colors distinguish waiting (amber), approved/preparing (blue), completed (green), and failed/rejected (red) across Intake, Progress and workflow runs.

## Protected CV updates and explicit review

**Start CV review** records an owner-scoped reviewer and start time for the preparation CV. Opening an editor is navigation and never starts review. Both standalone Resume detail and the embedded Candidate editor use the same approval endpoint and confirmation. Saving an approved CV requires an explicit acknowledgement that approval becomes pending again; old preparation snapshots, account access, assignments and answers are preserved.

The CV selector is now **preview only**. The preparation CV changes only through **Use this CV for a new preparation**, with a filename-specific explanation and the existing revision guard. Kanban cards and List rows show actual evidence, manual HR overrides, and preparation running/failed separately from the stage.

Telegram uploads after the first submission require candidate confirmation. An untouched, unapproved CV with no review/preparation/account history may be replaced; its original PDF is archived. Once HR starts review, or any approval/preparation/account history exists, the new file is an independent update request. The replacement transaction rechecks protection; a concurrent review converts the confirmation into an update request. One outstanding request per bot contact prevents duplicate competing updates. Unconfirmed/cancelled files do not become the application CV or trigger upload workflows.

HR reviews a separate update draft and can **Approve updated CV** or **Keep current CV** with a reason. Optional paid extraction updates that draft, not the active candidate information. Approval stores an independent information snapshot, marks the updated PDF current, and preserves the original preparation CV, form snapshots, assignments and submissions. It never starts approval workflows, resumes old runs, creates accounts, sends invitations or rewrites answers. When no application has been approved/prepared yet, adopting the update finishes initial review and makes its information the initial candidate profile. Otherwise, using an approved update for a future preparation is a separate explicit decision; it does not retroactively change the current preparation.

The bot keyboard is stage-aware: update submitted CV before review, request a CV/profile update after review starts, Open forms when an account exists, and Check application status. Confirmation offers Send update to HR or Confirm replacement plus Cancel upload. Old `/add_cv` and `/replace_cv` commands route into the same guarded update flow. Status follows actual progress and distinguishes sending an invitation from reading it. Update decisions and reasons appear in candidate history and bot status; HR decisions do not automatically send Telegram messages.

Migration `0026_candidate_cv_updates.sql` adds isolated update drafts, persistent review starts, transaction guards and replacement/archive protections. CVs referenced by update history cannot be permanently deleted until eligible linked records are resolved.
