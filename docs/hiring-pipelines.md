# Hiring pipelines

For a step-by-step frontend scenario, a different sales hiring order, and the current automation limits, see [Clean hiring flow and demo workspace](hiring-demo.md).

Hiring board cards, list rows and application details provide separate Archive and Delete permanently actions. Archive preserves application progress and documents and can be restored from Archive. Permanent deletion requires a reviewed confirmation and is limited to unused applications without recorded progress or linked preparation/form/interview evidence; candidate profiles and CVs stay available. Pipeline settings retain Archive/Restore and add Delete permanently for unused, non-default pipelines. See [Archive and retention](archive.md) for eligibility, concurrency and file-cleanup rules.

The Hiring pipeline page at `/hiring` follows job applications across configurable stages. Pipeline configuration does not introduce company accounts, interviewer logins or additional management permissions; the existing workspace owner remains authoritative.

## Unified application workspace

Hiring is the main navigation entry. Open an application to work in Overview, CV & documents, Interviews, Offer & outcome and Activity. Overview and board cards offer a contextual next action; the configured hiring stage remains separate from operational evidence. CV review, preparation review, submission acceptance/corrections, interview appointments and feedback use the existing guarded services inside the application. Save changes and Approve CV remain separate actions.

Application details lead with the current stage, application status and a next-action card with its explanation. More actions groups job changes, hold/resume, closing/reopening and access to the existing archive/deletion reviews. Overview separates an application checklist from supporting CV, document and pipeline details. The checklist shows job assignment and current CV approval plus the current stage's configured entry/exit checks, deduplicating requirements and identifying when they apply. Other evidence is expandable reference information, not presented as a stage-move blocker. Counts describe recorded checklist evidence, not overall hiring completion; stage moves retain server validation and may have additional destination requirements. Held and closed applications retain evidence viewing and explicit resume/reopen actions. Before starting interviews, missing job, CV approval, interview stage and configured entry evidence are listed with resolution actions. Required update reasons explain their minimum length.

The work selector includes Pipeline, Needs attention, Upcoming interviews, On hold / interviews paused, and Interview follow-up due. Counts and pagination use the same owner-scoped filter. Upcoming appointments show their recorded timezone. Home and the existing attention page include application task links. Existing list/detail URLs remain available for original records; mapped interview links open the application's Interviews tab, and candidate links choose the relevant application when more than one exists. Shared candidate profile and CV-update work remain explicitly accessible from CV & documents.

The main sidebar no longer exposes separate preparation/interview progress systems. **Legacy records** on the hiring board inventories original candidates, archived CV context, incomplete records and legacy interviews. It offers a preview before adoption. Missing CV context remains visible for resolution; an unknown archived stage requires an explicit mapping and reason. Adoption preserves original evidence references and recorded outcomes, never infers Hired, and starts no workflow or invitation. Original profile/interview links remain available for audit and shared-person tasks.

## Prepare documents for one application

Pipeline settings include **Preparation automation for new applications**. Publish Application workflows to make future applications use independent preparation automatically, including default-inbox intake; choose Legacy CV approval workflows to retain that model. Existing applications keep their selected ownership. Each application also offers an explicit ownership override. New models default to application workflows; existing published models without this setting retain legacy behavior.

From CV & documents, review and approve the selected CV, then choose a published preparation workflow and confirm **Start application preparation**. The workflow is pinned and starts once per application/workflow/CV. Its review stays inside the application; confirm an existing account explicitly or review new account/contact choices before continuing. An unchanged approved CV reuses its approval snapshot, so preparing another job does not invalidate the first application's preparation. Editing CV data still requires renewed approval.

Application-owned assignments are independent even when two jobs use the same account, published template and role. Required documents show only assignments linked to this application. Additional forms can be assigned here after account access exists. Assignment makes forms available in the candidate's account portal; it sends no invitation by itself. The portal identifies the associated job where known.

Use **Reuse existing account & forms** only when intentionally sharing existing assignments. Their provenance is retained, and correction/review changes affect readiness wherever that assignment is explicitly shared. Original form and interview snapshots remain immutable. Application readiness no longer depends on the candidate's single legacy CV/preparation selection. Held or closed applications retain viewable history and block preparation effects; resume or reopen explicitly to continue. Resolve recorded interview appointments before closing an application.

For an existing legacy application, expand **Preparation automation** and explicitly select application preparation. New applications from a model configured for Application workflows already inherit this choice. This prevents new legacy CV-approval preparation rules for the selected CV while any active application selects application preparation; published legacy workflows and existing executions stay retained. Finish active preparation before switching ownership. A workflow's **Prepare application account & forms** step starts the selected published preparation version and still waits for HR account/contact review. Keep subsequent movement in a preparation-completed or other evidence-event rule. Retrying or entering the stage again reuses the preparation for that application/workflow/CV; a new preparation intent needs a different reviewed workflow or CV. Existing same-template application assignments retain their original snapshots rather than silently collecting a fresh copy.

Application events also include preparation completed, all required forms submitted, all required forms accepted, interview round feedback complete and explicit interview decision recorded. Empty required sets emit no form-completion event. A feedback event is a signal to evaluate routing; Move application still checks every configured requirement. Events commit with the evidence update. Paid AI and candidate sends are never implied by moving a card.

An interview stage can choose completion across the whole application process or only rounds mapped to that stage. Configure this in the pipeline draft, then publish a new version. New rounds scheduled while in an interview stage are associated with that stage. Existing rounds can be explicitly mapped with a reason inside Interviews. A stage requirement needs a mapped completed round, every required submitted scorecard, and no scheduled mapped round; another interview stage's completion does not satisfy it. Existing published models retain their whole-process behavior until deliberately changed.

## Set up a hiring model

Use the **Pipelines** tab to edit hiring models and the **Job openings** tab to manage jobs. Stage rows show their activity and requirement count; expand a row to edit it, or use **Expand all / Collapse all** to change every row at once. Collapsing a stage keeps its unsaved values. **Add stage** opens and focuses the new stage, and Save draft / Review & publish remain visible while editing. Duplicate, default inbox, archive and permanent deletion controls are grouped under **More actions**, with their existing eligibility and confirmation checks.

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

While dragging, hold near either visible board edge to reveal off-screen stages; the page also scrolls near the top and bottom of the viewport. The current destination has a highlighted background, outline and **Drop to review move** indicator. The source card is dimmed during dragging and remains in its original stage until the move is confirmed. Dropping opens the existing review dialog; cancellation makes no change. After a successful move, the destination is brought into view and the moved card is briefly highlighted. Visual transitions respect reduced-motion preferences. On-hold applications remain non-draggable, and **Move to** remains available as the keyboard and touch alternative.

Application detail embeds its CV and preparation tools. **Reuse existing account & forms** previews the selected preparation and forms, requires explicit reuse confirmation, and checks the CV and preparation revision. It does not create assignments or silently import another application's forms. Linked assignments are shared only through that explicit decision. New applications start without linked assignments, even if that candidate already has accepted documents for another job.

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

An interview stage can require completed rounds and feedback before leaving. Multiple named interview stages use rounds inside the same application's process. Stages may use the whole process or explicitly mapped stage rounds for completion, as described above. Configurable per-round scorecard criteria remain follow-up work.

Offer stages support owner-recorded None, Draft, Sent, Accepted and Declined statuses with reasons. These are internal records. The app does not generate/send offers, collect signatures, synchronize calendars or send interview notifications. Hired requires an explicitly recorded accepted offer and a separate owner decision.

## Application automation

Create an Automation workflow with a custom application starting event, then choose its published pipeline version. Supported events are:

- Application received.
- Application job assigned.
- Application enters a selected stage.
- Application leaves a selected stage.
- Application CV approved by HR.
- Application preparation completed.
- All required application forms submitted or accepted.
- Interview round feedback complete.
- Explicit interview decision recorded.

Initial application creation also counts as entering its first stage. Explicit job assignment can enter a mapped destination stage. Application workflows support Conditions, Move application, Prepare application, Complete and Stop. Conditions can compare source, free-text applied position, structured job ID or stage, with Is / Is not. Pipeline stages and jobs appear as named select options. Move application requires an expected source stage and destination from the selected version.

For example, Application received or Job assigned → Job is Frontend Developer → Move Applied to CV screening. A separate Application CV approved event can move CV screening to Recruiter call. Receiving a frontend CV does not approve it.

Application workflows support routing and Prepare application, which invokes a pinned preparation workflow under application context and its existing review gates. Legacy CV-only workflows retain once-per-CV behavior until preparation ownership is explicitly switched. The evidence-completion events described above can route applications after required submissions, acceptance or interview feedback. Stage moves do not implicitly perform business actions.

Application events and stage changes commit atomically in D1. A dispatcher pins active matching published workflow versions when it marks an event dispatched. Retries cannot select a newer version for the same event. Runs deduplicate by event/workflow/version; a genuine later stage entry has a new event identity. A move receipt protects recovery when the move committed but execution acknowledgement was lost.

Execution uses the event's captured conditions and rechecks live source stage, application revision, ownership and evidence before changing anything. Competing moves cannot overwrite each other. Same-stage moves produce no stage event. Causation prevents a workflow from repeating within the same event chain, with an additional chain-length limit to stop cross-workflow loops. Failures appear on the application's Activity tab and in existing execution history. Background work uses the existing scheduled processor and post-response `waitUntil` handling.

CV update approvals are excluded from initial-approval routing, preserving the existing rule that approving a later CV update does not restart preparation or invitations.

## Existing candidates and retention

The board offers an explicit legacy import preview in batches of up to 20. Import preserves the selected CV, real/manual preparation stage, known stage-start time, required assignments and legacy interview link in a Legacy preparation pipeline. Interview Not selected/Withdrawn outcomes remain closed; Interview passed never becomes Hired. Earlier history stays on the candidate and interview detail pages.

Import creates no workflow events, invitations, accounts, assignments or AI requests. It is idempotent and checks candidate revisions and evidence in the mutation batch. New migrations do not automatically enroll historical candidates. The original import preview covers active preparation records; Legacy records also inventories archived, incomplete and interview-only records for explicit adoption.

CVs and preparation runs referenced by applications receive permanent-deletion blockers. Application history is append-only. The explicitly enabled owner-authorized test-data reset removes application evidence links, interviews and scoped assignments before applications, then their CV dependencies; ordinary candidate/form reset retains pipeline and job definitions. Reset all can remove definitions when explicitly selected. No production cleanup or deployment is part of local validation.

## Implementation and checks

Feature code lives in `features/hiring`, with thin owner-authorized `/api/hiring` routes. Migrations `0031_dynamic_hiring_pipelines.sql` and `0032_application_interviews.sql` add versioned configuration, applications, the durable event outbox, mutation receipts, guards and application-specific interview uniqueness. Migration `0033_unified_hiring_workspace.sql` adds scoped preparations/forms, interview stage mappings and evidence-event guards. Legacy preparation projections exclude application-owned executions, assignments and interviews.

Run the repository's lint, typecheck, local migrations and `npm test`. `tests/hiring.test.mjs` exercises publication, ownership, evidence gates, competing updates, event deduplication, recovery, version pinning, loops, multiple applications/interviews, protected CV updates, legacy import, outcomes and reset dependencies. Provider calls remain mocked by existing suites; these tests never send candidate messages or start paid AI.
