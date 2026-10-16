# Dynamic hiring pipelines and stage automation

Status: agreed design; the initial implementation is documented in [Hiring pipelines](../hiring-pipelines.md), including delivered scope and follow-up work. This document retains the broader design direction.

Scope: the full hiring process, connecting intake, preparation, interviews and eventual offers. Based on branch `codex/pdf-studio-self-host` at `fb30761`.

## Recommendation

Introduce reusable hiring pipelines, assign a pipeline to each job opening, and track each candidate's application independently. A company can use one default pipeline or different pipelines for Engineering, Sales and other hiring models.

The pipeline describes where an application is in the hiring process. Existing CV approval, document review, account preparation and interview records describe what actually happened. Connect them through explicit requirements and automation events.

This follows a common applicant-tracking-system pattern: configurable recruiting stages, structured activities inside those stages, and event/condition/action rules. Pipeline stages and workflow execution steps remain separate concepts.

## What exists today

- `features/candidate-progress/progress.ts` defines six fixed stages and derives progress from operational evidence.
- `features/candidate-progress/progress.server.ts` validates stage moves, audits overrides and recalculates their basis as evidence changes.
- `features/workflows/workflow.ts` supports staff-upload, Telegram-submission, CV-approval and manual triggers. Conditions compare source or free-text applied position; dynamic stages and stage-move actions are absent.
- `features/workflows/schema.ts` permits one run per workflow/CV pair. Recurring stage events need a different execution identity.
- `db/schema.ts` stores preparation progress per candidate and enforces one interview process per candidate. Multiple applications need application-scoped relationships.
- Interviews currently require accepted preparation before handoff and preserve an immutable accepted-document snapshot.
- Management authorization currently supports one configured owner. Multiple pipeline configurations do not introduce separate company accounts or team permissions.

## Proposed user experience

### 1. Configure a hiring model

Add a Pipelines settings area with a default template, duplicate-as-draft, stage creation, rename, reorder and archive. Keep a simple ordered stage editor as the main configuration surface; reuse the existing workflow canvas for branching automation.

Each stage has a stable ID, name, description, color, activity type, entry/exit requirements and optional linked activity configuration. Common activity types are inbox, CV review, forms, interview, offer and custom. Types provide suitable actions without imposing stage names or a universal order.

Examples:

| Hiring model | Example sequence |
| --- | --- |
| Engineering | Applied → CV screening → Recruiter call → Technical interview → Document collection → Offer → Hired |
| Sales | Applied → Phone screening → Role play → Manager interview → Offer → Hired |

Closed applications have a distinct outcome: hired, rejected or withdrawn. The board can show these as terminal columns or a Closed view. On hold is a flag with a reason, retaining the application's current stage.

CV review and document acceptance stay separate from hiring outcomes. Interview passed does not become Hired automatically.

### 2. Associate jobs and applications

Create a job opening with a stable job ID and selected published pipeline version. Intake through a job-specific link or explicit position choice creates an application in that pipeline's initial stage.

Keep candidate identity reusable: one person can apply for Frontend Developer and another role without sharing their stage, interview decision or application history. CVs and login identity may be shared through explicit references; approvals, preparation snapshots, required assignments and interview context must be linked to the correct application.

Use job IDs for automation instead of relying on spelling variations such as Frontend, Front-end Developer and Frontend Engineer. Existing `appliedPosition` can suggest a match, but missing or ambiguous positions stay in a default inbox for HR assignment. Incoming CVs do not necessarily contain trusted structured position data, and automatic routing must not require paid CV extraction.

### 3. Work from one hiring board

Select a job or pipeline to see its dynamic columns. Dragging or Move to uses the same guarded transition service as automation. Cross-pipeline views use a list or shared reporting categories; unrelated stage names should not be merged into misleading columns.

Cards show candidate, job, stage age, next action and evidence badges such as CV pending, 2/3 forms accepted or feedback pending. Candidate details link to the existing CV editor, forms and interview tools under the application context.

Reordering columns changes presentation order only. Explicit transition requirements control skipping, backward moves and completion; array position alone is not a business rule. Backward moves retain underlying approvals, forms and interview history and record a reason.

### 4. Connect automation

Every active stage from the selected published pipeline is available in three places:

| Workflow control | Example |
| --- | --- |
| Trigger | Application entered Technical interview |
| Condition | Current stage is CV screening |
| Action | Move application to Recruiter call |

The editor selects Pipeline first, then Stage. Show readable names while storing stable stage IDs and their published version references. Support stage is/is not and entered/left triggers initially; ordered comparisons such as “after screening” are ambiguous when stages are rearranged.

Other useful triggers are application received, job assigned/changed, current CV approved, required forms submitted/accepted, interview feedback submitted and an explicitly recorded interview decision. Existing upload triggers can remain CV-scoped; application automation gets its own context.

Example rules:

```text
WHEN an application is received, or its job is assigned later
IF job = Frontend Developer
AND current stage = Applied
THEN move to CV screening

WHEN the current application CV is explicitly approved
IF job = Frontend Developer
AND current stage = CV screening
THEN move to Recruiter call

WHEN a technical round has completed and all required feedback is submitted
IF current stage = Technical interview
THEN move to Hiring review
```

Moving to CV screening means awaiting review. Moving a card must never manufacture CV approval. A company using the name “CV approved” should configure a matching entry requirement. Position alone can route a candidate to review but does not establish that the CV was reviewed.

A stage move does not implicitly create an account, assign forms, schedule a round or send a message. Those are explicit workflow actions, using the existing guarded services. Stage entry may trigger such a published workflow. Keep business outcomes and notifications explicit.

## Requirements and activity completion

Offer a bounded catalog of requirements, rather than arbitrary expressions or executable code:

- Current application CV has approval for the correct revisions.
- Required contact or account-reuse confirmation exists.
- Specified preparation completed and specified invitation was sent, where required.
- Required application forms were submitted or accepted.
- Specified interview round completed and required feedback was submitted.
- A human recorded the required decision.

Distinguish entry from exit requirements. A Technical interview stage can accept an unscheduled candidate, then require a completed round and feedback before advancing. A Documents accepted stage can require accepted forms on entry. Terminal rejection/withdrawal should have their own reason-based closure rules, independent of normal forward-stage completion.

Requirements inspect real, application-scoped evidence and cannot be disabled by renaming a stage or issuing a workflow move. A custom administrative stage can have no requirements. Incomplete requirements return a clear blocker and a link to the action that resolves it.

Companies may collect forms after interviews. Supporting this intentionally changes the current universal accepted-documents-before-interview rule. Configure the needed CV/profile/contact evidence for interview entry, pin the context available at that point, and retain later accepted documents as additional immutable context. The legacy pipeline keeps its existing accepted-preparation gate. This requires an explicit implementation change to the current interview contract; it is not achieved through column customization alone.

Multiple named interview stages should link to distinct rounds/assessment requirements inside the application's interview process. Their feedback and criteria belong to those activities. The pipeline controls progression; appointment status and feedback completion remain evidence from the interview service.

Offers and Hired are new product scope. Start with explicit owner-recorded offer status and hiring outcome; offer document generation, signature, calendar integration and onboarding require separate follow-up work.

## Data and execution design

Suggested additions:

| Record | Responsibility |
| --- | --- |
| Hiring pipeline | Owner-scoped reusable configuration and draft |
| Pipeline version and stages | Immutable published stage definitions, stable stage IDs, activity configuration and requirements |
| Job opening | Structured role identity and default pipeline version |
| Application | Candidate, job, pinned pipeline version, current stage, status/outcome, revision and stage-entry timestamp |
| Application evidence references | Selected CV/profile/preparation, required assignments and linked interview context |
| Application event/outbox | Immutable lifecycle fact plus durable dispatch state |
| Workflow event receipt | Event/workflow-version execution identity and causation |

Extend the existing engine, services and lease/idempotency mechanisms. A stage transition should authorize the owner, verify application revision and required evidence, then atomically update the application, append history and enqueue the event in a D1 batch. Manual and automated transitions call the same service. Reads never advance applications.

The event captures application, pipeline version, job, from/to stage, actor, reason, timestamp, correlation/causation and relevant evidence revision. Evaluate event rules against the event's captured facts; recheck live application revision and business requirements when executing a mutation. If an application moved meanwhile, report a stale/conflicting action instead of pulling it back silently.

Application-triggered runs use an event ID plus workflow ID/version as their deduplication identity. Workflow selection is pinned when an event is dispatched, so a delivery retry cannot run a newly published version again for the same event. Preserve legacy workflow/CV uniqueness for legacy runs until explicitly migrated. Re-entering a stage produces a new transition event; retrying delivery of the same event does not repeat its side effects.

Require the expected source stage for automatic moves. Reject conflicting published routing rules for the same scope where detectable; serialize competing mutations with application revisions. No-op same-stage moves emit no new stage event. Propagate causation and suppress repeated execution of the same rule within a causal chain; cap chain length and show a blocked run when a loop is detected. Existing acyclic workflow validation alone cannot prevent loops between separate workflows.

The first release remains scoped to the existing management owner. SaaS company/workspace membership, roles and isolation are a separate foundational scope. Every new query and stage reference must still enforce current owner and pipeline ownership server-side.

## Versioning and existing data

- Draft edits never alter active applications or published workflow graphs. New applications use the selected published version; existing applications stay pinned.
- Retain stage identity across renames. Show current configuration labels and preserve historical labels in events. Do not hard-delete referenced stages or versions.
- Moving active applications to another pipeline/version requires a preview, explicit old-to-new stage mapping and requirement validation. Preserve history and list affected automation references.
- Retiring a referenced stage must explain affected jobs, applications and workflows. Keep the old version available for existing records; require mapping or replacement before retiring its active use.
- Build a legacy pipeline containing today's six preparation stages, connected interview work and explicit existing outcomes. Do not infer Hired from Interview passed.
- Backfill legacy applications idempotently from candidate/preparation/interview relationships, including interview-only or archived historical records. Reuse original IDs/evidence references and preserve manual overrides, audit history and genuinely unknown timestamps.
- Existing manually overridden stages and actual preparation evidence can differ. Preview these cases and preserve both; do not invent evidence to satisfy the new stage model.
- Backfill emits no workflow triggers, messages, accounts, assignments, AI requests or automatic interview enrollment. Preserve existing run behavior until the owner explicitly enables new automation.

## Delivery plan

1. **Application foundation:** add application identity and structured job selection; link existing preparation, assignments, runs and interviews without changing business actions. Design assignment reuse explicitly so one application's completion does not accidentally complete another.
2. **Pipeline builder and board:** add versioned stage CRUD, default templates, dynamic board/list filters, guarded manual moves and the legacy-data preview/migration.
3. **Stage automation:** add stage selectors, event triggers, move action, transactional outbox, event-based run identity, causal loop protection, execution explanations and sample preview.
4. **Connected hiring activities:** link named interview rounds to stages, support configurable interview-entry requirements and forms timing, then add explicit offer/hiring records. Reuse existing interview scheduling/feedback screens.

The first useful release combines the foundation, a basic pipeline editor/board and application-received/stage-entered/CV-approved automation with Move application. Keep richer interview gates and offer tooling in the following increment while preserving existing interview behavior.

## Acceptance scenarios

- Two hiring models show different stages and can be selected by job; stage names and ordering are company-configurable.
- A Frontend application routes to its configured CV-screening stage; missing job information stays in the inbox and routes after explicit job assignment.
- Every selected pipeline stage is available as a workflow trigger, condition and move target, using IDs rather than label matching.
- Routing by position cannot mark a CV approved, accept documents, submit feedback or record a hiring decision.
- Manual and automated moves report the same requirement failures; concurrent updates cannot silently overwrite one another.
- Repeated event delivery does not duplicate actions; two genuine entries into a stage remain separate events; cross-workflow loops stop with a visible explanation.
- One candidate can have two independent job applications without stage, form requirement or interview-result leakage.
- Renaming, retirement and pipeline-version changes preserve active applications, published automation and readable history.
- Legacy migration preserves evidence and historical outcomes and sends no messages or workflow events.
- A later connected-activities release supports interviews before document collection when the selected model permits it, while the legacy model retains its current gate.

## Related current behavior

- [Candidate Preparation](../candidate-progress.md)
- [Candidate workflows](../candidate-workflows.md)
- [Interview Progress](../interview-progress.md)
- [Architecture](../architecture.md)
- [Accepted decisions](../decisions.md)
