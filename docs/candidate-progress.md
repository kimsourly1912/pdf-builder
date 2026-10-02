# Candidate progress

Open **Candidates → Progress** to follow CV review, candidate preparation and form completion. Intake remains under **Candidates → Intake**. Progress groups active CVs by candidate; receiving another CV does not create another card for an existing candidate.

The Kanban and List views show the same data. The view preference is saved for each HR account in the current browser. Search supports name, email, Telegram username and CV filename. Stage and Needs attention filters apply to both views. Pages contain up to 50 candidates; column totals cover all matching candidates. Data refreshes every 15 seconds and when the window regains focus.

## Stages and safeguards

| Stage          | Meaning                                                                                                                    |
| -------------- | -------------------------------------------------------------------------------------------------------------------------- |
| New            | The selected CV has not been verified or started review.                                                                   |
| Reviewing CV   | HR started reviewing, or a workflow is waiting for review.                                                                 |
| CV approved    | The current CV and candidate information were verified in the Resume Editor. AI extraction is optional.                    |
| Awaiting forms | Preparation completed for the approved CV, all required forms were assigned and any required Telegram invitation was sent. |
| Ready for HR   | Preparation completed and every required form was actually submitted.                                                      |

Drag a Kanban card or use its **Move to…** menu. Moving forward cannot substitute for CV verification, workflow preparation, a required invitation or form submission. When an action is missing, the dialog links to the relevant screen. Backward moves require a reason, record an audit event and preserve existing CV approval, accounts, invitations and submissions. Actual progress is shown alongside a manually overridden HR stage. New underlying activity recalculates the stage.

## Candidate detail

The detail page shows contact information, selected CV, preparation run, required forms and a progress timeline. Completed forms link to their submission PDF when available. The timeline records CV receipt, approval, workflow preparation, Telegram delivery, submissions, stage changes and selection changes. “Invitation sent” means the delivery succeeded; it does not claim that the candidate read the message.

Choose a CV explicitly to review a newer submission. Existing preparation remains associated with its original CV. Preparation history includes older and archived runs; archived CVs and runs cannot be selected. If the selected CV is archived, another active CV is selected. Candidates with no active CV are excluded from Progress and remain accessible through Archive. Changing the approved CV after preparation requires preparing against the current approval before marking that preparation ready.

## Implementation and validation

Migration `0023_candidate_progress.sql` stores HR stage and CV/run selections. Actual approval, preparation, invitation and submission states come from existing records. Owner checks scope every API read and mutation. Revision checks and a D1 batch guard reject concurrent changes instead of overwriting them. Progress mutations never extract a CV, create a login, send Telegram messages or submit a form.

Integration coverage exercises owned access, stale updates, concurrent form changes, manual CV verification, real form submissions, multiple CVs, archive handling and backward moves. Browser validation covers actual dragging, guarded transitions, Resume Editor approval, saved List preference, CV selection, the timeline and mobile menus.
