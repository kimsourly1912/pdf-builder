# Decision log

These accepted decisions describe the current product and technical contracts as of 2026-10-03. This is a maintained summary, not a reconstruction of when each decision was originally made. Change a decision explicitly when requirements change and update the affected implementation and feature guide.

| ID | Accepted decision | Reason and consequence |
| --- | --- | --- |
| D01 | Deploy the application from `codex/pdf-studio-self-host` through GitHub Actions. | This is the existing production source. A push deploys production; `main` and local Wrangler emulation are not staging targets. |
| D02 | Keep management authorization scoped to the configured owner. | Current services support one management owner. Multi-HR routing and permissions require an explicit design rather than client-side filters. |
| D03 | Store Telegram candidate data without creating a login or extracting the CV with AI. | Intake should be inexpensive and reusable. An intake/candidate record is not an authentication account. |
| D04 | Make paid CV extraction optional and explicit in the Resume Editor. | HR can manually enter and approve data when AI credits are unavailable. Bot and workflow operations cannot incur extraction cost automatically. |
| D05 | Separate draft saving from explicit CV approval. | HR can save incomplete work safely. Approval requires current candidate/CV proof and can trigger a published approval workflow. Changed data needs fresh approval. |
| D06 | Make workflow purpose explicit through starting events and presets. | Telegram review, preparation after approval, and manual preparation serve different goals. Review-only completion must not imply account/forms are ready. |
| D07 | Guard account creation/reuse and snapshot preparation inputs. | Email matching alone does not authorize reuse. Current review proof, confirmed reuse, pinned template versions, revisions, and leases protect candidate identity and history. |
| D08 | Use activation links for new Telegram accounts and sign-in links for existing accounts. | Candidates set their own passwords. Telegram workflows never send temporary passwords. Existing staff-managed account flows retain their separate credential handling. |
| D09 | Track Telegram sent, failed, deferred, and uncertain states honestly. | Sending is not reading. Uncertain delivery requires an explicit check before resend; retries preserve accounts and assignments. |
| D10 | Group multiple CVs under the same candidate and retain explicit CV selection. | New uploads must not silently change the approved CV used by an existing preparation. Replacement identifies and archives the unreviewed CV. |
| D11 | Archive before eligible permanent deletion. | HR can restore records while protected account/form/workflow evidence remains retained. Permanent deletion rechecks eligibility and queues file cleanup atomically. |
| D12 | Offer Kanban and List views over one progress model. | HR can choose a working view. Forward moves require actual approval/preparation/submission evidence; backward overrides require a reason and audit history. Ready for HR is not hiring acceptance. |
| D13 | Derive waiting time from stage events, not general activity. | Retries and metadata changes must not reset waiting time. Unknown legacy timestamps remain explicitly unknown. |
| D14 | Use a short agent guide with task-specific linked documentation. | Agents receive essential safety and setup context without loading every feature guide. Standards and architecture stay maintainable outside the root guide. |
| D15 | Permit the requested eight-character test-admin password through secure deployment secrets. | Authentication minimum and sign-in validation are eight characters; recipient activation retains its own stronger validation. Never commit the actual credential. |

Details: [Telegram](telegram-candidate-intake.md), [Workflows](candidate-workflows.md), [Progress](candidate-progress.md), [Archive](archive.md), and [Architecture](architecture.md).

For a new decision, add a stable ID, explain the tradeoff and resulting constraint, and link relevant behavior documentation. If superseded, retain the ID and mark it superseded with a link to the replacement rather than erasing the history. Do not record secrets or conversational transcripts here.

## Whole-form web assignments alongside legacy PDF templates (2026-10-03)

New web forms assign all fields to one managed account; recipient roles are absent from their authoring and candidate interfaces. The existing PDF template editor remains available until an explicit retirement/migration decision. A private single-user storage adapter reuses existing workflow and assignment guards; it is not an authentication role.

Drafts and published versions are separate. Published form presentation, fields, JSON keys, placements and source PDF are pinned per assignment. PDF output is optional and generated after the immutable JSON response commits; generation failure does not undo submission. Retrying uses the same snapshot. Use React Hook Form/Zod, the current dnd-kit React adapter, react-rnd, signature_pad and the existing PDF stack rather than inventing drag, form or signature primitives.

## HR workspace and document review (2026-10-03)

- Daily navigation centers on candidates and HR tasks. PDF editing remains a full-width tool at `/studio`; older template-editor links remain compatible.
- Reading/review screens use a centered 80rem container; interactive canvases and Kanban use full width.
- CV verification and document acceptance are separate from hiring decisions.
- Correction requests create a new account-protected attempt with the same pinned version and approved snapshot. Original answers/artifacts remain immutable; new draft media cannot own original submission media.
- Form acceptance is evidence-derived and cannot be substituted by a Kanban move. Management remains owner-scoped pending a separate team-permissions design.

## 2026-10-03: CV updates do not restart an active application

A Telegram CV update has an independent confirmation and HR review draft. Once review starts, the application PDF is protected from candidate replacement. Accepting an update creates a new approved snapshot while preserving the preparation CV and all existing form data. No account/form preparation or Telegram invitation is rerun automatically. CV preview is navigation; choosing a CV for a future preparation is explicit. Both Resume detail and Candidate detail expose one shared approval operation.

## 2026-10-03: Workflow previews and graph metadata

Workflow sample tests are pure browser previews and never call the runner, create accounts/assignments, approve CVs, generate activation links, send Telegram messages or request paid AI. Live execution retains current-revision review and account/contact checks. Draft validation may retain unfinished invitation text; publication remains strict. Names and internal annotations are bounded graph metadata and travel with immutable published snapshots. Duplication creates an inactive draft with no published version or execution history. Recorded branch outcomes are added for future executions; absent legacy evidence is not reconstructed from assumptions.

## 2026-10-03: Published workflow history is separate from draft recovery

Publication snapshots are written by a SQLite trigger in the publication update transaction. Restoring a snapshot uses normal owner-scoped, revision-guarded draft saving; it never activates, republishes or mutates existing executions. Restored form targets lose old version pins and are validated/pinned at the next publication. The history migration retains the latest existing publication only; older graph snapshots are unavailable. Integration readiness is read-only configuration feedback, not a delivery or candidate authorization check. Intentional HR/Telegram waits have no inferred failure timeout; processing delay notices describe lack of activity without claiming failure.

## 2026-10-03: Guided setup reuses workflow publication safeguards

The setup guide is an authoring interface over the existing preset graphs and APIs, not a separate runner. It saves inactive drafts and requires explicit publication; sample previews have no server effects. Only unchanged preset structure can resume in the guide; customized, archived or published workflows stay in the editor. URL draft identity is owner-authorized by the existing API and does not grant access. Readiness feedback includes the Telegram intake starting event as well as invitation steps.
