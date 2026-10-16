# Roadmap and current status

## 2026-10-16 implementation: hiring pipelines

The unified workspace extension brings CV review, application-owned preparation/forms, interview tasks, offer records and activity into application detail. It adds evidence-event routing, pinned preparation actions, interview stage/round mapping, task queues, legacy adoption and compatible old links. Separate preparation/interview sidebar entries are consolidated into Hiring. GitHub Actions for the exact published commit records deployment verification. See [Hiring pipelines](hiring-pipelines.md#unified-application-workspace). First-time HR usability and user-confirmed real recipient delivery remain follow-up validation.

Configurable published hiring models, job openings, independent applications, a dynamic board/list, guarded entry/exit requirements, application event routing, connected application interviews and explicit offer/outcome records are implemented. Existing preparation remains available, with explicit legacy import and protected evidence. See [Hiring pipelines](hiring-pipelines.md) for setup and exact scope. Publication/deployment status remains separate from this implementation record.

Follow-up work includes application-scoped account/form preparation actions in application graphs, automatic form/feedback event triggers, round-specific stage requirements and scorecards, job-specific public intake links, offer generation/signing, and company/team authentication. Existing guarded preparation automation remains available.

As of 2026-10-03. This page focuses on the recent candidate intake, workflow, archive, and progress work. Git history and GitHub Actions remain the source of truth for publication and deployment; this page is not a deployment log.

## Shipped capability

| Area | Current behavior |
| --- | --- |
| Telegram intake | Contact and original PDF collection without automatic paid AI or login creation; explicit additional/replacement CV actions and application status. |
| CV review | Optional confirmed AI, manual editing, separate Save changes and Approve CV, current-revision approval, unsaved-change safeguards. |
| Preparation workflows | Interactive canvas and focus mode, contextual catalog, node names/annotations and search, draft/live change review and recovery, safe sample previews, execution input/output inspection, saved overview filters and inactive duplication; purpose presets and starting events; guarded review/account reuse; CV linking, pinned forms, Telegram activation/sign-in invitations, recovery and history. |
| Intake guidance | One next-step summary, actual progress, direct missing-requirement actions, selected CV context, state-specific preparation actions. |
| Archive | Linked intake/CV groups, restore, eligibility and protected-history explanations, limited Undo, guarded permanent deletion and durable file cleanup. |
| Candidate Preparation | Original Kanban/List, guarded transitions, CV/run selection, forms and timeline remain available through compatibility routes and Legacy records; daily tasks live in Hiring. |
| Web form builder | Click/drag fields, reorder, shared candidate preview, separate PDF mapping, immutable whole-form assignments, private media, JSON/PDF responses and PDF retry; legacy PDF templates remain available. |
| HR workspace | Task-based Home/navigation, tabbed candidate profile, centered reading containers, HR form acceptance and new correction attempts preserving original history. |
| Progress usability | Saved owner-scoped filters/view, useful page/column counts, event-based waiting times, sorting, consistent status presentation, issue-resolution links, responsive layouts. |
| Test data reset | Staging-only explicit flag, owner-authorized preview/confirmation, linked cleanup, protected administrator, optional retention of definitions, durable file deletion and reset receipts. |
| Appearance and spacing | Persistent Light/Dark/System selection, themed management and candidate forms, workflow/execution canvases and studio controls; separate workflow sections and wrapping actions. PDF paper and signature ink retain document colors. |

Feature details live in the [documentation index](README.md). Automated integration and browser checks have covered the recent changes; actual HR usability sessions remain useful and are listed below.

## Proposed next improvements

- [Unified hiring workspace design](proposals/unified-hiring-workspace.md): delivery direction and acceptance scenarios. Follow-up work includes first-time HR usability verification and richer preparation attempts.

These ideas are not implemented or scheduled by this roadmap. They need their own agreed scope before development.

| Priority | Proposal | Intended outcome and design question |
| --- | --- | --- |

| High | Safe Telegram reminder controls | Preview the message, show the last reminder, require explicit sending, and prevent duplicate/uncertain sends. Decide timing and allowed recipients. |
| Medium | Assigned HR owner and internal notes | Clarify responsibility and handoffs. Multi-HR authentication and access rules must be designed before owner assignment is more than a label. |
| Medium | Expand the existing candidate timeline | Include replacement events and additional HR decisions in the timeline that already shows approval, preparation, invitations, forms, and stage changes. |
| Medium | HR usability sessions | Test multiple CVs, failed/uncertain invitations, incomplete forms, archives, and mobile work with real HR users using safe test data. |

## Maintenance

When work ships, move it into the shipped table and update the relevant feature guide and decisions. Keep proposals concrete; do not assign invented completion dates or call a proposal approved because it appears here. Record detailed validation evidence in the commit/PR and GitHub Actions rather than maintaining duplicate test counts in this page.

### Shipped: protected CV updates and progress clarity

- Explicit Start CV review with reviewer/time evidence.
- Preview-only CV browsing and confirmed selection for a new preparation.
- Independent Telegram upload confirmation and pending HR update review, with approve/keep-current decisions.
- Stage-aware bot buttons/status, preserved preparation/form history, and no automatic rerun on update approval.
- Stage explanations, evidence, preparation running/failed notices, HR override wording and approved-edit acknowledgement.

## Form builder interaction update (shipped October 2026)

- Guided Build form → Map PDF (optional) → Preview & test → Publish & assign workspace.
- Searchable field palette, insertion points, inline selected labels and expandable advanced settings.
- Direct PDF placement with safe Select/Place/Pan modes, floating formatting, keyboard nudging, snapping, page navigation and mobile field selectors.
- Explicit PDF exclusions, single-line/wrapped output, text/background color, line spacing, minimum font size and image fit.
- Sample-answer testing and publish readiness preserve revision-checked autosave and pinned published versions.

Editing original PDF text/layout and automatic recognition of blank or dotted areas are not part of this update.

## Automation workspace refinement (shipped October 2026)

- Separate saved drafts, unpublished graph changes and live starting events, with change review and overlapping-event checks before publication.
- Focus mode, grouped contextual tools, searchable named/annotated nodes and accessible node action menus.
- Browser-only sample path, assignment and invitation previews with no external or database effects.
- Desktop execution workspace and mobile details, recorded outcomes and input/output evidence, existing guarded recovery actions.
- Owner-scoped overview filters, latest execution context and inactive draft duplication without run history.

Sample testing is a planning preview, not a live integration test. Missing legacy branch evidence remains unknown.

## Automation readiness and history (shipped October 2026)

- Draft readiness appears in Settings and publication review; manual execution checks the published snapshot before enabling Start. Checks inspect published/archived forms, pinned versions and required bot configuration without contacting Telegram or running AI. Candidate contact still needs explicit HR confirmation. Automatic events keep their existing guarded execution behavior.
- Settings lists published snapshots and previews differences before an explicit restore to draft. Restore uses owner and revision checks, saves current edits first and leaves the live publication, activation and existing executions intact. Forms are revalidated and repinned on the next publication. Migration `0028_workflow_publish_history.sql` backfills only the latest existing publication; older snapshots cannot be reconstructed. Its publication trigger records future snapshots in the same transaction as the workflow update.
- Execution search, status and date filters persist per owner and workflow via URL/session storage. Clear filters resets them.
- Execution details emphasize the candidate and next action. Technical IDs and archive controls appear under More execution actions. HR review has no timeout; Telegram confirmation and retry waits are distinguished. New step-start timestamps support elapsed waiting time; legacy records without evidence show no invented duration. Over 15 minutes without a processing update shows a cautious delay notice, not a failure claim.

## Guided workflow setup (shipped October 2026)

New workflow opens `/workflows/new`: Purpose → Forms → Readiness → Sample preview → Review & publish. Choose a standard purpose, name the workflow and select published forms. Saving creates an inactive draft; Save draft for later allows unfinished form choices. Saved draft cards offer Continue guided setup. The draft ID in the URL supports reloading; sample acknowledgement is deliberately not persisted. Refreshing forms preserves current name and choices. Legacy PDF forms retain their role selection.

Readiness checks cover invitation and Telegram intake bot configuration, selected forms and required versions. A sample preview is local only; HR can explore approval, rejection and missing contact without external calls. Review checks other active workflows with the same event, requires sample acknowledgement and readiness, then explicitly confirms publication. The guide rechecks readiness immediately before publishing and uses the existing owner/revision-guarded publication API. Publication pins forms and activates future events; it does not process historical CVs.

Advanced canvas setup remains available. Published, archived or customized drafts continue in the editor; the guide never rebuilds custom graph edits from a preset. Draft edits require an explicit save and retain unsaved-change protection.

## Needs attention queue (shipped October 2026)

`/needs-attention` is the owner-scoped daily task page under Candidates. It combines the existing evidence-based candidate progress model, active unlinked staff CVs and pending owned form submissions. HR Home uses the same task source for counts, the first 20 tasks and direct action destinations. The page supports search, issue type, priority/oldest order and 25-task pagination. Filters persist per owner in URL/session storage; refresh runs every minute and retains the last loaded tasks on failure.

CV review and CV update tasks open the editor. Contact/setup tasks reuse existing confirmation and execution screens. Failed runs open their saved execution; archived runs are excluded. Pending active assignments include preserved form history, while cancelled/expired assignments remain separate blockers. Each unreviewed submission opens its existing HR review screen; accepted/correction-requested and archived submissions are excluded. A candidate can have multiple independent tasks. Manual Kanban stages do not replace operational evidence.

Waiting clocks use CV receipt, update receipt, assignment and submission timestamps. Contact waits use recorded approval when available. Failed runs show Last run update rather than inventing a failure start time; missing evidence remains unknown. Waiting forms are not labelled overdue and no reminders, resends, approvals, workflow runs or AI processing occur when opening this page. Task actions navigate to existing guarded operations.

## Application journey revision (shipped October 2026)

- Home and Needs attention separate HR actions from candidate waiting, with preserved responsibility filters and shared counts.
- Incoming candidates and Submitted forms have distinct names. Existing PDF tools remain accessible under Advanced tools.
- Candidate next-action and evidence-based journey guidance remain visible across profile tabs; linked CV actions converge on the profile.
- Form creation defaults to build/preview/publish; PDF output is optional, with guided mapping and no blank PDF pane for web-only forms.
- Assignment screens identify the recipient/CV, distinguish account availability from notification, and provide explicit access sharing/recovery paths.
- Automation shows business behavior from actual draft/published graphs while retaining the interactive canvas and existing execution safeguards.
- Workspace setup and a browser-only published candidate-form preview provide an entry path for new HR users.
- Candidate My forms and receipts explain completion, corrections and HR review in task language.

A first-time HR usability trial remains necessary to establish comprehension without coaching. Automated checks demonstrate behavior and responsive layout, not that every user understands the application.

### Browser QA follow-up (2026-10-04)

- Candidate Needs attention filters and counts use the shared HR task projection, including unfinished CV reviews and submitted forms; waiting on candidates remains separate.
- CV draft saves and approval copy are distinct. Missing name/email requirements are visible beside approval with a direct field-focus action.
- Required and minimum-length text validation provide separate reasons in preview and live forms.
- Mobile sign-out and CV editor controls retain accessible names. Empty candidate results offer intake/upload actions and filter recovery.
- Telegram intake through activation, submission, correction and acceptance still needs the browser tester’s confirmed test contact; these fixes do not establish completion of that manual trial.

### Guided candidate workspace (2026-10-04)

- One next action, evidence-derived status, three primary tabs, and expandable supporting information.
- One approval/preparation summary with saved contact reuse, explicit account reuse, pinned form names, stale-summary guards and immediate background processing.
- Inline preparation and delivery recovery; actual delivery determines Send/Retry/Resend.
- Field-specific email validation before approval and CV draft edits in History.
- No natural-language agent or paid AI is included; full browser testing with a user-confirmed Telegram recipient remains a separate verification step.


### Automation editor clarity (2026-10-04)

- Canvas-first layout with compact Preview / Review & publish actions and secondary live-run controls.
- Searchable step outline, explicit branch destinations and direct next-step navigation.
- Essential settings first, expandable metadata and connection changes, unified Data & behavior explanations.
- One insertion control per connected path; draft/live behavior comparison remains available on demand.


### Automation preview and setup fixes (2026-10-04)

- Read-only sample path canvas with branch highlighting, simulated waiting/setup stops and optional editor overlay.
- Stored sample inputs survive reopening; draft changes invalidate overlays.
- Setup fixes focus exact form, message, condition and connection controls; missing incoming links use free validated outputs.
- Existing execution and publication safeguards are unchanged. Execution-result and publication-summary proposals remain separate follow-up work.


### Form review and focused workflow canvas (2026-10-05)

- PDF preview/output uses a bundled Khmer-capable font; failed previews preserve sample answers and the previous rendered document.
- Form assignment searches existing accounts by name/email, identifies Candidate/Employee and shows current-version duplicate assignments.
- Response search and separate account/review filters, readable answer details, and an Assigned people view with pinned versions and actual link availability.
- A dedicated workflow editor with on-demand step catalog, contextual desktop inspector/mobile bottom sheet, and supporting views in More actions.
- Measured first-entry fit, saved viewport, Shift/marquee selection, grouped dragging, alignment/distribution, smart guides with Alt bypass, select/hand tools and global graph undo/redo.

A first-time HR usability trial remains necessary to confirm comprehension. Local browser and integration checks do not establish Telegram delivery or read receipts.

## Candidate Preparation and Interview Progress (shipped October 2026)

- Separate Candidate Preparation (`/candidates`) and Interview Progress (`/interviews`) with an explicit, idempotent handoff from server-proven Documents accepted. Original approved CV, account, preparation and accepted document context remain pinned.
- Active stages Ready to schedule, Scheduled, Awaiting feedback and Decision pending; Closed outcomes Interview passed, Not selected and Withdrawn. Search, filters, counts, pagination and keyboard-accessible responsive boards.
- Multiple named-interviewer rounds, timezone-aware UTC appointments, retained rescheduling/cancellation history, explicit completion/no-show and per-interviewer draft/submitted scorecards.
- Explicit rounds completion and owner decisions, meaningful reasons, holds/follow-up/resumption, decision correction/reopening and atomic candidate history. Archive and staging reset preserve or explicitly handle interview dependencies.
- Action list and optional stage board with owner-scoped attention/upcoming/feedback/final-review/follow-up queues, lifecycle-based status age, next-task navigation, guided scheduling, rating guidance and submitted-assessment comparison. Accepted/current preparation comparison and editable copyable appointment messages keep original evidence and communication explicit.
- Internal tracking only: no automatic invitations/reminders, calendar sync, AI evaluation, vacancy module, hiring/offer or onboarding flows.
