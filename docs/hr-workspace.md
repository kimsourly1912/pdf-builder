# HR workspace

The application now opens on **HR Home**. It lists new CVs, candidate issues, outstanding form preparation and submitted forms awaiting HR review. Issues appear first, then oldest work; the summary shows at most 20 tasks and links to full candidate and review lists. Staff CVs without a linked candidate remain accessible through the CV library and Home tasks.

## Navigation and layout

- **Candidates**: Kanban/List, New submissions and CV library. Telegram submission rows open the candidate profile.
- **Forms & documents**: web form templates, the HR review inbox, existing PDF templates and PDF studio.
- **Automation**: published workflows and run recovery.
- **Administration**: existing account-access controls, Telegram intake, AI history, audit and archive.

Reading/review pages, tables and card lists use one centered 80rem shell container. Candidate Kanban, web form builder and workflow canvas use full width. The standalone PDF studio remains full width at `/studio`; bookmarked `/?templateId=...` URLs redirect there. Existing template, intake and workflow URLs remain accessible.

## Candidate profile

The profile has URL-addressable Overview, CV & documents, Forms, Communication and History tabs. Overview explains one next action and distinguishes CV verification, access, preparation, invitations, form submission and HR acceptance. CV & documents embeds the existing guarded Resume Editor; changing tabs or CVs prompts before discarding unsaved edits. Save changes and Approve CV retain their separate semantics and optional paid AI.

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
