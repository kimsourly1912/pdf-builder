# Unified hiring workspace

Status: implementation complete, 2026-10-16; current behavior and limits are documented in [Hiring pipelines](../hiring-pipelines.md#unified-application-workspace). GitHub Actions for the exact commit on `codex/pdf-studio-self-host` records production deployment status. This document retains the delivery direction and acceptance scenarios and extends the [dynamic pipeline design](dynamic-hiring-pipelines.md).

The shared workspace, application-owned preparation/forms, evidence automation, mapped interview stages, queues and legacy navigation are implemented. A first-time HR usability trial remains a follow-up. Preparation retries reuse the application/workflow/CV identity, and same-template assignments retain their original snapshots; separately numbered preparation attempts and collecting a fresh copy of the same form within one application remain follow-up work.

Local verification: all 326 integration/unit tests pass, including 27 hiring tests. Production build/binding verification, lint, TypeScript checking, isolated D1 migrations and documentation links pass. Browser journeys verified CV approval and unsaved changes, preparation/account review, candidate submission and HR acceptance, mapped interviews, timezone queues, old-link routing, legacy inventory, published preparation ownership, keyboard dialogs, and mobile layouts in both themes, with no page errors. Tests used synthetic records and mocked providers; real recipient delivery and a first-time HR usability trial were not performed. These results do not indicate a production deployment.

## Product direction

Make Hiring pipeline the main place to manage an application from intake to a recorded outcome. Open an application once to review its CV, prepare access and documents, conduct interviews, record an offer, and understand automation. Preserve the existing operational services while replacing navigation between three separate progress systems.

Candidate means the reusable person; application means that person's hiring process for one job. Show the job and application context throughout every action. A person applying for two jobs gets two cards with independent stages, forms requirements, interview results and outcomes. Reusing existing evidence is an explicit, explained choice.

Scope includes application preparation, embedded work tools, work queues, related automation and a safe transition from the old pages. It does not add team accounts, external calendars, automatic candidate messaging, paid AI, offer signatures or onboarding.

## One everyday flow

1. Open Hiring pipeline and select a job or published hiring model. Use Board or List, preserving the existing filters and position when returning from detail.
2. Open a card. See candidate, job, stage, time in stage, blockers and one primary next action.
3. Complete that action inside the application: review CV, prepare documents, review submissions, schedule an interview, submit feedback, or record an offer.
4. Show the resulting evidence and the next required action. If stage requirements are satisfied, offer Move to the appropriate stage; a published automation may perform a configured move instead.
5. Continue in the same workspace until an explicit Hired, Not selected or Withdrawn decision. On hold retains the current stage and reason.

The user's configured pipeline determines stage names and order. Activity type determines useful tools; requirements determine whether movement is allowed. A Recruiter call before documents and a Document collection before interviews model are both valid.

## Application layout

Keep the application header and actions visible across tabs. The header shows the selected CV, job, pipeline version, stage, hold/outcome, primary next action and a secondary Move action. Stage names and operational status appear separately, for example Technical interview / Feedback pending.

| Area | Contents |
| --- | --- |
| Overview | Current task, completed and missing requirements, appointments, relevant warnings and recent activity |
| CV & documents | Selected application CV, explicit review/approval, preparation, account/contact confirmation, required forms, submission review and delivery status |
| Interviews | Application interview process, named rounds, appointments, feedback, final interview review and original context |
| Offer & outcome | Owner-recorded offer progress, explicit hiring decision, hold/close/reopen actions |
| Activity | Application timeline, relevant linked evidence history and automation execution results |

Overview is the default landing tab. Its primary action opens the exact tool and relevant round/form in the appropriate tab. Secondary tasks remain accessible even when their activity is not the current stage. Tools show prerequisites and explain disabled actions. Consolidate existing History and Automation tabs into Activity with filters and links to full execution diagnostics.

Keep the simple path prominent; account technical details, historical snapshots and full workflow diagnostics belong in expandable sections. On phones, use a compact header, accessible tab navigation and dialogs with visible action footers. Preserve unsaved edits, browser Back, direct tab/task links, keyboard focus and refresh behavior.

## What the primary action does

| Activity | Example primary action | Evidence and blocker |
| --- | --- | --- |
| Inbox/custom | Assign job or review requirements | Missing job or configured requirement; custom stages do not invent a task |
| CV review | Review CV, then Approve CV | Exact selected CV/profile revisions; Save changes remains separate |
| Forms | Prepare documents, Open submissions, or Review documents | Application-linked requirements and actual submissions/acceptance |
| Interview | Start interviews, Schedule round, Submit feedback, or Review interview decision | Linked process and round evidence; scheduling alone never completes a round |
| Offer | Record offer progress or Record hiring decision | Accepted offer and explicit owner decision are distinct |

Use a deterministic shared task resolver for detail, board/list and work queues. Prioritize an actionable failure or prerequisite before routine activity. A blocker links to the control that resolves it. Allow viewing work on held/closed applications; explain which mutations require resumption/reopening.

Do not create another derived hiring stage from legacy preparation or interview statuses. The application's configured stage is authoritative for placement. Operational statuses such as Forms submitted and Awaiting feedback describe evidence beneath that stage. A completed task changes stage only through an explicit move or configured automation.

## Board, navigation and work queues

Keep one primary navigation entry: Hiring pipeline. Incoming candidates and CV library remain supporting tools; pipeline/job settings remain in Administration. Once parity and legacy coverage are verified, remove Candidate Preparation and Interview Progress from the main sidebar.

Add accessible views within Hiring pipeline:

- Pipeline: the existing job/model board and cross-pipeline list.
- Needs attention: actionable failures, pending CV reviews, submitted forms awaiting review, missing interview feedback and decisions awaiting review.
- Upcoming interviews: appointments grouped by date with timezone, job and a direct application task link.

Queues are alternate views of the same application records, not extra progress systems. Counts cover all matching results before pagination; query and browser-session state are owner-scoped. Preserve the existing interview follow-up and paused-work filters. For cross-pipeline queues, use shared task categories instead of pretending different stage names are equivalent. Reconcile the existing Home and Needs attention links with these application task links.

Cards and rows show candidate, job, stage age, primary next action, concise evidence counts and important failures. Show automatic movement in recent activity and a success notice when observed; avoid silently returning an edited card to an unrelated view.

## Required preparation foundation

This is more than embedding the current candidate page. The current `candidate_progress` row selects one CV/run per candidate; it cannot be the authoritative preparation selection for multiple job applications. Current form assignments also deduplicate by account/template-version/role, and legacy preparation workflows deduplicate by workflow/CV. Both contracts need an explicit application scope before retiring the old navigation.

1. Add relational application preparation/evidence links for selected preparation runs, account/contact confirmation and required form assignments, with owner authorization, revision guards and retained original snapshots. Keep old candidate selections as legacy compatibility state.
2. Support application-owned form assignments and requirements. Preserve the legacy account/template-version/role uniqueness for non-application assignments; add application-scoped uniqueness and request keys for new assignments. Two applications may require independently completed copies of the same template. Existing account/employee assignment behavior must remain valid.
3. Default new application preparation to its own requirements and assignments. Reuse a completed assignment only through explicit preview/confirmation, recording its provenance and shared lifecycle. Explain that changes to deliberately shared evidence can affect every linked application; rejection/correction must invalidate affected readiness.
4. Reuse a login identity only after the existing account/contact confirmation. Reusing an account does not imply reusing another application's forms. Keep existing recipient links working and show job/application context in recipient views where known.
5. Derive application preparation readiness directly from that application's pinned CV, selected run, required assignments and invitation requirements. Remove the current dependence on the candidate's single selected preparation for new applications. Changing candidate legacy selections must not change an application's readiness.
6. Extend archive, permanent-deletion blockers and explicit test-data-reset ordering for these references. Keep historical submissions, original account references and document snapshots intact.

Use additive migrations and a preview before adopting existing evidence. Do not overwrite old records or automatically select an ambiguous preparation. Retain the application's existing evidence JSON as a compatibility snapshot until all reads/writes are migrated and verified.

## Interviews inside the application

Extract reusable interview content/controllers from the current page-level shell. Embed the same scheduling, scorecard, decision, document context and history components under Interviews. Keep one process per application and the original approved-CV/accepted-document context immutable. Later preparation is shown separately.

For the initial UI consolidation, preserve existing whole-process interview requirements and label them accurately. Before supporting independent completion of several named interview stages, add versioned stage-to-round requirements: a round can satisfy its mapped stage only when attendance/completion and required submitted feedback are present. Use stable stage IDs within the pinned pipeline version, preserve mappings on rename, and require explicit mapping for old rounds. Do not silently apply a process-wide Complete flag to every interview stage.

Separate application hold/outcome from interview-specific pause/outcome in labels and actions. Do not have a legacy interview decision silently close an application. An explicit application decision can coordinate the linked process in a guarded transaction after showing the effect and any scheduled appointments; retain every prior decision and appointment. Reopening the application must not automatically reopen its interview process or resend communications.

## Automation in the same flow

Retain dynamic stage event/condition/move selectors and published pipeline/workflow version pinning. Add application-context preparation actions using the existing guarded engine: prepare/reuse account, assign required forms and explicitly deliver a configured invitation. Show a preparation preview before enabling actions with account reuse or delivery consequences.

Record durable application events for required forms submitted/accepted, relevant interview feedback/round readiness and explicit interview decision. Evaluate required sets and stage-round mappings, not just a single submitted form or scorecard. These events can trigger published routing rules. A stage move alone does not send a message, create access, approve a CV or record a hiring outcome.

Preserve event/workflow/version deduplication, leases, expected-source/revision checks, mutation receipts and causal-loop limits. Add preparation/request identities scoped to application and preparation attempt so a retry cannot duplicate assignments or delivery, while a separately confirmed new preparation remains possible.

Legacy CV-only workflows continue unchanged during coexistence. Identify overlapping legacy/new preparation rules in a cutover preview. Require an explicit choice of which automation owns new application preparation; do not run both for the same intent. Published graphs and original runs are never rewritten. Import/adoption emits no lifecycle triggers; new automation starts only for subsequent eligible events after activation. Approving a later CV update continues to trigger no preparation/invitation workflow.

## Legacy records and links

- Inventory active, held, closed, archived and interview-only legacy records, including records with no active CV. The existing active-preparation import does not cover all these cases.
- Preview links to existing applications and proposed legacy applications, retaining selected CV/run, manual stage, original stage timestamps, evidence and interview outcomes. Ambiguous or incomplete records remain in a visible review queue; do not invent a job, approval, timestamp or Hired outcome.
- Adopt records idempotently in bounded batches, using original record identities and revision proofs. Do not send messages, create accounts/assignments, enrol interviews or execute workflow events during migration.
- For a mapped interview detail link, route to its application's Interviews tab. For a candidate with one application, show its workspace; for multiple applications, show an application chooser preserving the requested task. Candidate-wide CV/profile/update tasks remain explicitly identified as shared person-level work.
- Keep unmapped and historical detail routes usable with a legacy banner and a path to adoption. Redirect old list pages to equivalent application queues only once all actionable legacy records are available or discoverable through the review queue. Preserve bookmarked query/task links, owner checks and read-only navigation.

## Delivery sequence

| Increment | Deliverable and completion gate |
| --- | --- |
| 1. Shared workspace | Reusable embedded CV/interview content, application header/tabs and shared next-action resolver. Keep legacy navigation available and explicitly show where preparation still uses compatibility mode. Existing app users can do CV review and application interviews without leaving detail. |
| 2. Application preparation | Scoped preparation and form assignments, independent readiness, account/document reuse preview, recipient context, retention/reset updates. Two applications for one person can prepare the same form independently. |
| 3. Automation and interview stages | Application preparation actions, evidence events, explicit legacy automation cutover, stage-to-round mappings and accurate completion gates. Retries and re-entry are safe and understandable. |
| 4. Work queues and migration | Attention/upcoming views, unified task links, complete legacy preview/adoption and route compatibility. Every actionable old record is reachable. |
| 5. Navigation cutover | After end-to-end parity and migration checks, remove the separate progress entries. Retain compatibility routes and original evidence; verify the complete journey with a first-time HR user. |

Each increment should be reviewable separately. Do not present the workspace as fully unified or remove old entry points after only the tab-layout increment. Revertible UI cutover should preserve new application records and work already completed; rollback must not depend on destructive schema reversal.

## Acceptance and verification

- Frontend hiring works from one application detail: receive → assign job → CV approval → recruiter/technical interviews → document acceptance → offer → explicit Hired. A documents-first model works too.
- Multiple interview stages have independent mapped rounds and feedback gates; completing one does not satisfy another.
- One candidate applying for two jobs, including the same CV/form template, has independent preparation selections, answers, stages, interviews and outcomes. Confirmed sharing has visible provenance.
- Candidate profile/CV updates retain original application/form/interview context; pending CV updates cannot become selected evidence and accepted updates do not restart automation.
- Manual moves and automation report identical evidence blockers. Stale writes, concurrent approval/correction and competing moves reject rather than overwrite work.
- Retried preparation, duplicated evidence events and stage re-entry do not duplicate accounts, assignments, invitations or workflow effects. Overlapping old/new workflow cutover executes only the selected owner of preparation.
- Interview appointments, timezone/attendance/no-show rules, required draft/submitted feedback, decisions, holds/reopening, invitation uncertainty and account reuse protections retain their current behavior.
- Active/closed/archived/interview-only legacy data, manual overrides and ambiguous links remain discoverable with history. Adoption is idempotent and has no business side effects.
- Old candidate/interview bookmarks reach the correct application or chooser. Reads, redirects and opening a tab cause no lifecycle mutations.
- Desktop/mobile, both themes, keyboard/dialog focus, unsaved edits, loading/error/empty states, deep links and Back navigation work. No nested app shells or duplicate top-level controls.

Run owner/CSRF, integration and migration coverage for changed services, appropriate lint/type/build checks, and browser journeys at each increment. Use synthetic records and mocked provider calls; real recipient delivery testing requires a user-confirmed test recipient. Planning itself changes no application or production data.
