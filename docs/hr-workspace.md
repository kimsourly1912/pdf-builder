# HR workspace

The application now opens on **HR Home**. It lists new CVs, candidate issues, outstanding form preparation and submitted forms awaiting HR review. Issues appear first, then oldest work; the summary shows at most 20 tasks and links to full candidate and review lists. Staff CVs without a linked candidate remain accessible through the CV library and Home tasks.

## Navigation and layout

- **Candidates**: Kanban/List, New submissions and CV library. Telegram submission rows open the candidate profile.
- **Forms & documents**: web form templates, the HR review inbox, existing PDF templates and PDF studio.
- **Automation**: published workflows and run recovery.
- **Administration**: existing account-access controls, Telegram intake, AI history, audit and archive.

Reading/review pages, tables and card lists use one centered 80rem shell container. Candidate Kanban, web form builder and workflow canvas use full width. The standalone PDF studio remains full width at `/studio`; bookmarked `/?templateId=...` URLs redirect there. Existing template, intake and workflow URLs remain accessible.

## Candidate profile

The profile has URL-addressable Overview, CV & documents, Forms, Communication and History tabs. Overview explains one next action and distinguishes CV verification, access, preparation, invitations, form submission and HR acceptance. CV & documents embeds the existing guarded Resume Editor and an independent CV update review; changing tabs or CVs prompts before discarding unsaved edits. Save changes and Approve CV retain their separate semantics and optional paid AI.

Forms shows the linked account's assignments and identifies those required for the selected preparation. Direct web-form assignment requires an existing account and an approved CV. It reuses the existing user/version assignment and does not send a message. Published preparation can be started from the profile using existing review/account-reuse/Telegram guards. Telegram candidates use the existing invitation preparation path; a suitable published workflow and explicit contact/reuse confirmation are required.

A direct assignment with the current approved profile can count as manual preparation when no workflow run is selected. An older or unrelated account assignment does not satisfy the current CV's required forms. Workflow requirements still come from the pinned graph. CV information approval is not a hiring decision.

Communication shows actual invitation evidence for the selected preparation and supports explicit contact confirmation. Sent is not a read receipt; uncertain delivery still uses existing run recovery. History preserves preparation selections and adds recorded HR form decisions.

## HR review and corrections

The **Form review inbox** lists pending, accepted and correction-requested submissions with search and pagination. Candidate Forms and web-form Responses link to a shared review screen displaying saved answers and completed PDF (when configured/ready). JSON export includes template/version identity, stable answers and readable field metadata. PDF failure leaves JSON review available.

Acceptance records an immutable HR decision separately from immutable answers. It does not accept an employment application or mark somebody hired. When every required form is actually accepted, progress becomes **Documents accepted**; submitted forms awaiting HR review appear under **Forms to review**.

A correction requires a written reason and the current completed account assignment. It rotates that assignment to a new private, one-response recipient link, preserving its account, published version and approved-prefill snapshot. The previous submission, original PDF, images and decision remain saved. Web-form text/choice answers seed the new draft; photos and signatures must be provided again so draft cleanup cannot delete original media. Legacy PDF forms receive a fresh attempt with their original assignment snapshot. The candidate portal and form show HR feedback. No Telegram message is sent automatically; HR can copy the account-protected link.

Each submission can be decided once. Concurrent, superseded, archived, disabled-account and archived-template correction attempts fail without changing links or assignments. The review and new-attempt writes run in one guarded database batch. Reviews of public legacy submissions can be accepted; requesting corrections requires a managed account assignment.

## Scope

This release organizes existing recruitment/document preparation. It does not introduce hiring decisions, jobs/interviews, employee records, payroll, multiple management roles or automatic reminder sending. Management authorization remains scoped to the configured owner. Legacy PDF templates remain available.

CV updates require candidate confirmation and an HR decision. Previewing another PDF does not change progress. Existing preparations retain their original CV/information snapshot after update approval. [Candidate progress](candidate-progress.md#protected-cv-updates-and-explicit-review) describes these safeguards and the explicit Start CV review action.

## Guided daily journey (October 2026)

The daily path is Receive → Review → Prepare → Invite → Review answers → Accept documents. **Home** separates **Your actions** from **Waiting on candidates**, using the same task projection as Needs attention. The attention page adds a responsibility filter, preserves it per owner, and applies it before type/search pagination. Pending forms remain candidate waiting; independent contact, account, CV and execution blockers still appear as HR tasks.

The sidebar uses **Incoming candidates** for Telegram CV intake and **Submitted forms** for HR answer review. Existing PDF templates/studio remain under **Advanced tools** at `/advanced`; their URLs and assignments are unchanged. Linked CV-library and attention actions open the candidate’s CV & documents tab. A library link preserves the chosen filename as a read-only preview; only active CVs belonging to that candidate projection can be selected by the URL. It does not change preparation selection or approval. Unlinked staff CVs retain their standalone editor. Original Telegram receipts remain accessible from Communication.

A next-step panel and evidence-based journey remain above every candidate tab. They identify whether HR, the candidate, or automation acts next. Manual Kanban overrides do not mark journey milestones complete. The Forms tab shows the recipient, selected template and approved CV before assignment, then separates account availability from actual Telegram delivery. Copying a sign-in/form link never records an invitation or generates an activation capability. First-time Telegram activation and uncertain-send recovery retain the existing preparation safeguards.

`/setup` checks Telegram configuration, owned published web forms and active preparation graphs with available form targets. Configuration checks do not prove a live webhook or message delivery; administrators must test the bot before sharing it. `/setup/preview` uses an owner-authorized published form snapshot, including its title/instructions. Sample validation and receipt stay in the browser, without account creation, AI, assignments or submissions. Setup and preview do not mark a candidate reviewed or prepared.

Candidate-facing My forms removes template version jargon, names corrections directly and explains draft saving, submission receipts and the wait for HR review. Hiring decisions, team permissions, automatic reminders and candidate due dates remain outside this change.
