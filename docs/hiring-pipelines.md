# Hiring pipelines

The Hiring pipeline page at `/hiring` follows job applications across configurable stages. Existing Candidate Preparation and Interview Progress remain available for their detailed tasks. Pipeline configuration does not introduce company accounts, interviewer logins or additional management permissions; the existing workspace owner remains authoritative.

## Set up a hiring model

1. Open **Candidates → Hiring pipeline → Manage pipelines & jobs**.
2. Create a pipeline. Add, rename, reorder or remove draft stages. Each stage has a description, color, activity and optional entry/exit requirements. Reordering columns does not move applications or define allowed transitions.
3. Save the draft, then **Review & publish**. Publication creates an immutable version. Existing applications and published workflows retain their selected version, including stages removed from later drafts.
4. Create a job opening using a published pipeline version. Updating a job's selected version affects future applications; existing applications keep their version. Assigning the same job again provides an explicit destination-stage mapping for an application that needs to move to its job's newer version.
5. Choose **Use as default inbox** on a published pipeline to enable automatic intake for future candidate-linked CV uploads. The initial stage of the default pipeline cannot have entry requirements. Unknown jobs remain unassigned until HR selects a job; the app does not infer a trusted job identity from CV text or run paid extraction.

The starter model contains Applied, CV screening, Recruiter call, Technical interview, Document collection and Offer. These names and their order are editable. Closed outcomes are recorded separately as Hired, Not selected or Candidate withdrawn.

Pipeline retirement is archival: old applications and workflow references continue to use their retained version. New jobs and new application workflows cannot select an archived pipeline. Choose another default before archiving the current inbox model. Duplicating a pipeline creates an unpublished draft.

## Applications and the board

Each application references one candidate, CV, optional job and published pipeline version. One person can apply for multiple jobs, with independent stages, interviews, outcomes and explicitly linked form requirements. There can be one active application per candidate/job. Intake creates one default application per candidate rather than another application whenever that candidate uploads a CV.

The board shows one pipeline version at a time; All pipelines uses a list. Search, job, status, stage, page and view preferences are scoped to the owner and remembered through the existing URL/session filter helper. Pages contain up to 50 applications; stage totals cover all matching applications. A column with more results offers a stage filter. Dragging and the accessible Move to dialog use the same guarded service as automation. Backward manual moves require a reason and preserve evidence. Refreshing and page reads perform no lifecycle actions.

Application detail links directly to its CV and candidate preparation. **Link existing preparation** previews the selected preparation and forms, requires explicit reuse confirmation, and checks the CV and preparation revision. It does not create assignments or silently import another application's forms. Linked assignments are shared only through that explicit decision. New applications start without linked assignments, even if that candidate already has accepted documents for another job.

CVs referenced by applications are protected from automatic replacement. **Use another approved CV** explicitly selects an active HR-approved CV for this application, requires a reason and acknowledgement, and retains the original form and interview snapshots. A pending CV update cannot become a new application CV before acceptance. Selecting an approved update emits history but starts no approval automation.

Changing a job shows the old and destination stage and validates requirements. An application with preparation, interviews or an offer for an existing job cannot be retargeted to a different job; create a separate application instead. On hold retains the stage and reason, blocks moves and ordinary activity updates, and requires explicit resumption. Closing/reopening records a reason. An accepted offer and an explicit Hired decision are separate actions; moving to Offer or passing interviews never marks Hired.

## Stage requirements

Entry and exit requirements inspect real evidence:

- Current CV approved by HR for the correct candidate and revisions.
- Linked preparation completed, still current and satisfying required invitation evidence.
- Every explicitly linked required form submitted.
- Every explicitly linked required form accepted by the workspace owner.
- Linked interview rounds completed with all required feedback and no scheduled round.

A custom administrative stage may have no requirements. Stage labels never manufacture approvals, submissions or feedback. Missing evidence returns a blocker; candidate and interview links open the guarded activity that can satisfy it. Reordering a stage does not change its requirements.

## Connected interviews and offers

In an interview activity stage, **Start application interviews** requires a current HR-approved CV plus that stage's configured entry requirements. Each application gets one independent interview process, even when another application or the legacy candidate process already has interviews. Repeated/concurrent starts reuse the same process.

The process pins the original CV, approved profile, account where available, linked preparation and accepted linked documents. A model can therefore interview before document collection; the screen identifies the original application context rather than claiming documents were accepted. The existing scheduling, round, feedback, decision, pause and history services are reused. Later preparation changes do not overwrite the original interview evidence. Legacy handoff from Candidate Preparation retains its universal accepted-document requirement.

An interview stage can require completed rounds and feedback before leaving. Multiple named interview stages use rounds inside the same application's process. Round-specific configurable scorecards and per-stage round requirements remain follow-up work; the current interview-complete gate checks the linked process as a whole.

Offer stages support owner-recorded None, Draft, Sent, Accepted and Declined statuses with reasons. These are internal records. The app does not generate/send offers, collect signatures, synchronize calendars or send interview notifications. Hired requires an explicitly recorded accepted offer and a separate owner decision.

## Application automation

Create an Automation workflow with a custom application starting event, then choose its published pipeline version. Supported events are:

- Application received.
- Application job assigned.
- Application enters a selected stage.
- Application leaves a selected stage.
- Application CV approved by HR.

Initial application creation also counts as entering its first stage. Explicit job assignment can enter a mapped destination stage. Application workflows support Conditions, Move application, Complete and Stop. Conditions can compare source, free-text applied position, structured job ID or stage, with Is / Is not. Pipeline stages and jobs appear as named select options. Move application requires an expected source stage and destination from the selected version.

For example, Application received or Job assigned → Job is Frontend Developer → Move Applied to CV screening. A separate Application CV approved event can move CV screening to Recruiter call. Receiving a frontend CV does not approve it.

This release focuses application workflows on routing. Keep existing CV-approval preparation workflows for account creation, form assignment and Telegram delivery. Those workflows retain their current review/reuse guards and once-per-CV behavior. Stage moves do not implicitly perform these business actions. Automatic form-completion/interview-feedback triggers and application-scoped preparation action graphs are follow-up work.

Application events and stage changes commit atomically in D1. A dispatcher pins active matching published workflow versions when it marks an event dispatched. Retries cannot select a newer version for the same event. Runs deduplicate by event/workflow/version; a genuine later stage entry has a new event identity. A move receipt protects recovery when the move committed but execution acknowledgement was lost.

Execution uses the event's captured conditions and rechecks live source stage, application revision, ownership and evidence before changing anything. Competing moves cannot overwrite each other. Same-stage moves produce no stage event. Causation prevents a workflow from repeating within the same event chain, with an additional chain-length limit to stop cross-workflow loops. Failures appear on the application's Automation tab and in existing execution history. Background work uses the existing scheduled processor and post-response `waitUntil` handling.

CV update approvals are excluded from initial-approval routing, preserving the existing rule that approving a later CV update does not restart preparation or invitations.

## Existing candidates and retention

The board offers an explicit legacy import preview in batches of up to 20. Import preserves the selected CV, real/manual preparation stage, known stage-start time, required assignments and legacy interview link in a Legacy preparation pipeline. Interview Not selected/Withdrawn outcomes remain closed; Interview passed never becomes Hired. Earlier history stays on the candidate and interview detail pages.

Import creates no workflow events, invitations, accounts, assignments or AI requests. It is idempotent and checks candidate revisions and evidence in the mutation batch. New migrations do not automatically enroll historical candidates. Archived CVs stay retained; the import preview covers active preparation records.

CVs and preparation runs referenced by applications receive permanent-deletion blockers. Application history is append-only. The explicitly enabled owner-authorized test-data reset includes application events/receipts/applications before their CV, form and interview dependencies; ordinary candidate/form reset retains pipeline and job definitions. Reset all can remove definitions when explicitly selected. No production cleanup or deployment is part of local validation.

## Implementation and checks

Feature code lives in `features/hiring`, with thin owner-authorized `/api/hiring` routes. Migrations `0031_dynamic_hiring_pipelines.sql` and `0032_application_interviews.sql` add versioned configuration, applications, the durable event outbox, mutation receipts, guards and application-specific interview uniqueness. Legacy preparation projections exclude application-routing executions and application-specific interviews.

Run the repository's lint, typecheck, local migrations and `npm test`. `tests/hiring.test.mjs` exercises publication, ownership, evidence gates, competing updates, event deduplication, recovery, version pinning, loops, multiple applications/interviews, protected CV updates, legacy import, outcomes and reset dependencies. Provider calls remain mocked by existing suites; these tests never send candidate messages or start paid AI.
