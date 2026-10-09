# Interview Progress

**Candidates → Candidate Preparation** remains at `/candidates`, with the existing candidate profile URLs. Its stages remain New → Reviewing CV → CV approved → Awaiting forms → Forms to review → Documents accepted. Documents accepted means HR accepted the required documents, independently of interview results.

**Candidates → Interview Progress** opens `/interviews`. From an actually accepted preparation, choose **Move to interviews**, enter a position/title and optionally name the responsible person. The owner defaults as responsible. This explicit action creates one persistent interview process per candidate. Repeated, concurrent or retried handoffs return that same process; migration and page reads never enrol existing candidates. Closed processes are continued through explicit reopening, rather than duplicate handoff.

The process pins the original candidate display information, CV, approved profile, account, preparation run (when present) and accepted assignments/submissions. Later CV edits, approved updates and preparation selection do not replace that context. The candidate profile and preparation card show **View interview progress** after handoff. The candidate History tab includes interview events.

## Active and Closed

The Active board derives its stage from evidence:

| Stage | Evidence and next action |
| --- | --- |
| Ready to schedule | No scheduled appointment or outstanding required evaluation; schedule a first/next round. |
| Scheduled | An appointment is recorded; review, reschedule, cancel, mark completed or record no-show. An elapsed appointment stays Scheduled until an explicit action. |
| Awaiting feedback | A completed round has missing required submitted evaluations. Drafts remain outstanding. |
| Decision pending | The owner explicitly marked rounds complete after at least one completed interview, every required evaluation submitted and no scheduled round. Record the final decision. |

Closed lists Interview passed, Not selected and Withdrawn. Interview passed does **not** mean Hired. Search matches the pinned candidate name, email, Telegram username and position. Stage/outcome and On hold filters, matching totals and 25-process pagination use owner-scoped data. The Active board scrolls horizontally within its container on narrow screens; all actions are buttons/menus and require no dragging. URL/session filters persist separately for each owner.

## Rounds and appointments

Open a process to see its accepted documents, rounds, scorecards, final decision and history. Each round stores an interview name, 1–10 distinct named required interviewers, date/time, duration (5–480 minutes), explicit IANA timezone, in-person location or HTTPS meeting link, and internal preparation notes. Default timezone is `Asia/Phnom_Penh`. The server resolves the local time to UTC and rejects invalid/nonexistent/ambiguous DST wall times; use another time or UTC when needed.

One scheduled round is allowed at a time. Complete it and submit its required feedback before scheduling another round. Multiple rounds remain separate records inside one process, rather than additional board columns. Rescheduling and cancellation retain previous appointment details in immutable history. A completed round cannot be rescheduled; create a new round for reassessment. No-show only records attendance: choose rescheduling or an explicit withdrawal/closure. Neither elapsed time nor no-show automatically rejects anyone.

Appointments are internal records: recording Scheduled sends no notification and does not establish confirmed attendance. New schedules/reschedules require a future time. Completion/no-show requires that the recorded start time has arrived.

## Feedback and decisions

Each required named interviewer has their own draft/submitted scorecard for the completed round. Criteria are Relevant skills, Relevant experience, Communication required for the role, and Role-specific requirements. Ratings use 1 (limited evidence) through 5 (strong evidence), or **Not assessed**, stored as null and never scored as zero. Notes, strengths, concerns and Proceed / Do not proceed / Another interview needed recommendations support review; they never make a decision automatically.

The authenticated owner records feedback attributed to a named interviewer; the owner who entered it and server timestamp are stored separately. No interviewer login or independent HR permission is introduced. Draft feedback can be edited. Submitted evaluations are retained as evidence; schedule another round for reassessment. After required submissions, either schedule another round or explicitly **Mark rounds complete for final review**.

Interview passed and Not selected require completed rounds, submitted feedback, an explicit rounds-complete action and a meaningful reason (10–2000 characters). Withdrawn is a separate outcome with its own reason and can occur before interviews. Every decision records the authenticated owner and server timestamp. Closure blocks ordinary scheduling/feedback until reopening.

On hold requires a reason and supports an optional follow-up date. It retains the current stage and blocks ordinary editing until explicit resumption; withdrawal remains available. Resume, decision correction and reopening require reasons. Correction retains the previous outcome, reason, actor and timestamp in history. Reopening retains original appointments, scorecards and previous decisions; it enables another round or final review according to existing evidence.

## Persistence, authorization and retention

Migration `0030_interview_progress.sql` creates interview processes, rounds, feedback, accepted-document references, immutable events and transient transaction guards. Foreign keys protect the original candidate, CV, profile, account, preparation and accepted assignments/submissions. There is no backfill enrollment. The Drizzle migration was generated using `npm run db:generate`, numbered after the deployed migrations and extended with history/snapshot protections.

All routes authenticate the management owner. Reads and mutations scope the process and nested records to that owner. Handoff compares the preparation revision and a database evidence snapshot inside the atomic D1 batch, including review revisions and assignment membership. Evidence is scoped to the candidate and its linked accounts; a concurrently changed shared account/form still requires a refresh. Other mutations use the process version, bounded validated DTOs, a request identifier and digest. Stale/conflicting updates return actionable 409 errors. Process/round/feedback changes, immutable interview events and candidate audit history commit together or roll back together. Retrying the same mutation returns its receipt; reusing its identifier with different data is rejected.

Normal Archive still retains interview context. CV/account/run permanent deletion explains interview protection and foreign keys recheck it in the deletion batch. The explicitly enabled staging Test data reset lists interview dependencies in its preview: Clear candidates, Clear forms and preparation history, and Reset all remove the owner's linked interview records before their preparation/documents. Clear eligible automation history retains interview-linked runs. Reset membership and owner checks are required to delete immutable interview events; unrelated owners and normal audit protections remain intact. No process reads mutate lifecycle records or call providers.

## Scope and validation

This is internal interview tracking only. It does not send Telegram invitations, reminders or outcomes, synchronize calendars, evaluate with AI, manage vacancies, hire candidates, create offers or perform onboarding. Existing Telegram intake and preparation delivery retain their own behavior.

`tests/interviews.test.mjs` uses the existing SQLite D1 helper and Vite server mocks to cover ownership/authentication, real accepted evidence, repeated/concurrent handoff, revision conflicts, atomic rollback, appointments/no-show, multiple rounds and required feedback, decisions/holds/withdrawal/correction/reopening, original-context isolation, archive and staging reset. Deployment smoke checks require the actual Candidate Preparation and Interview Progress headings and authenticated interview API. Exact validation and publication/deployment evidence belong in the PR and GitHub Actions.

## Detail page navigation

The candidate header leads with status, Schedule interview → Collect feedback → Final decision, and the next available task. A completed round with all feedback submitted offers Prepare final decision directly, with Schedule another round available as an alternative. The Interviews tab contains newest rounds first, required feedback, and final decision; Documents contains the original accepted preparation; History contains the immutable action trail.

Scheduling and optional follow-up dates use the shared shadcn calendar picker. Appointment time is entered with 12-hour hour/minute and AM/PM selects; the timezone defaults to Cambodia and remains explicitly editable. Native date/time inputs and datalist suggestions are prohibited for management screens in UI standards and ESLint.

“Interview took place” and “Candidate did not attend (no-show)” become available after the start time. No-show records attendance without rejecting the candidate. Round cancellation and no-show, and process hold/withdraw/reopen/correction, are available through explained Manage status dialogs with the existing server validation and reason dialogs.

Round cards group the appointment date, AM/PM time, timezone, duration, location and interviewer badges. Feedback cards show submitted counts, separate recommendation/status badges, scores out of five (with Not assessed unscored), and labeled notes, strengths and concerns. Recommendations remain separate from final decisions. AM/PM entry converts to the existing local-time payload without changing timezone or UTC persistence.

## Documents, history and guide

Documents opens read-only shadcn dialogs: the original CV uses the shared PDF renderer, accepted forms show submitted answers and an available PDF tab, and the linked account shows only current name/email/category/access/password-setup status through an owner-scoped interview endpoint. Credentials and session data are never included. Preview failures offer retry without leaving the interview. Existing submission and PDF authorization and archive rules remain in force.

History is a compact, newest-first table with ten entries per page. Details opens full reasons and earlier appointment/decision context; summary truncation never removes the original history. The Interview guide button opens the ordered workflow and explanations of appointment, feedback, final-decision, hold/withdraw/reopen/correction actions. Previews and guide do not perform mutations or send messages.

## Visible actions and final-decision readiness

The final-decision panel appears above interview rounds and shows completed-interview, submitted-feedback, and pending-appointment requirements. Prepare final decision explicitly marks rounds complete; it does not choose an outcome or close interviews. Choose final outcome then requires an explicit Interview passed or Not selected selection and reason before closing. Missing feedback has a direct completion action; paused processes must resume first. The previous bottom-only rounds-complete control is removed.

Manage status explains temporary Pause interviews versus closing as Candidate withdrawn, and describes resume/reopen/correct actions. Each operation dialog has action-specific consequences, a descriptive reason label and confirmation button. Scheduling keeps appointment creation separate from notification. Success messages explain the resulting state and next step. All transitions retain existing server authorization, versions, reasons and audit history.
