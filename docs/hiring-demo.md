# A clean hiring flow and demo workspace

The primary record is a **job application**. A candidate is the person, a job
opening identifies what they applied for, and a published hiring model defines
the stages for that application. One person may have several applications.

Use application preparation consistently. Keep CV-only preparation for existing
legacy records; do not enable both models for a new application.

## Follow the frontend example

The Engineering model collects documents before interviewing:

**Applied → CV screening → Documents → Technical interview → Offer**

1. Assign the **Frontend Developer** job. A job-assigned rule checks that job's
   identity, then moves Applied to CV screening. Other jobs take No → Stop.
2. HR reviews and approves the CV. A CV-approved rule checks the Frontend job
   and starts its published preparation workflow.
3. HR reviews account choices in preparation. The preparation creates the
   candidate account, links the approved CV and assigns the frontend form.
   The preparation-completed event moves CV screening to Documents.
4. The candidate submits their form. This does not approve the answers or move
   the application to interview.
5. HR accepts the required answers. A forms-accepted rule checks the Frontend
   job and requests Documents → Technical interview. The server rechecks the
   current stage and evidence.
6. Schedule and complete the technical interview, submit feedback, and record
   the decision. Review the result before moving to Offer. An accepted offer
   and the final Hired decision remain separate explicit actions.

The Sales model shows a different hiring order:

**Applied → CV screening → Sales interview → Documents → Offer**

Assign Sales Executive, review its CV, then conduct the interview before
collecting documents. The frontend preparation rules do not match this job.
This model intentionally leaves the later decisions with HR.

## Sample records

| Sample | Position text | Assigned job | Expected stage | Next action |
| --- | --- | --- | --- | --- |
| DEMO Dara Frontend — forms to complete | `frontend` | Frontend Developer | Documents | Complete the required frontend form, then accept it as HR |
| DEMO Lina Frontend — ready for interview | `Front-end Developer` | Frontend Developer | Technical interview | Schedule the technical interview |
| DEMO Vannak Sales — needs CV review | `Sales Executive` | Sales Executive | CV screening | Review and approve the CV, then move to Sales interview |

Dara and Lina are synthetic profiles explicitly approved once during this demo
setup. The script uses the normal owner-authorized CV and preparation review
APIs, including revisions and confirmations. Their account creation, CV links,
form assignments and stage moves are real application operations. Lina's
synthetic answers are submitted using her own authenticated account and accepted
through the normal HR review API. They are not fabricated database evidence.

Real candidates still require HR approval. Telegram is omitted from this demo
at the user's request. No messages or paid AI calls occur. New demo account
passwords are random and never printed or exported; manage their access through
the normal Accounts controls if testing candidate sign-in. Use the management
form preview to inspect the form without signing in as a candidate.

There are two jobs, two published models, one published web form, one preparation
workflow, and five short routing workflows. The routing workflow names are
numbered in the order encountered by HR. Each rule has one event and one job
condition, rather than one graph attempting the entire hiring lifecycle.

## What Condition and Move application actually do

**Condition** chooses a branch; it does not approve a CV, create an account or
change a stage. Prefer a selected Job opening for routing. Position text compares
the whole string, ignoring capitalization and surrounding spaces only. It does
not understand aliases: `frontend` and `Front-end Developer` are different text
values, although both demo applicants intentionally have the same structured job.

**Move application** requests a move from an expected current stage to a chosen
destination. It validates live evidence and concurrent changes. A stage name or
manual move cannot manufacture CV approval, completed preparation, accepted forms
or interview feedback. A completed workflow is not a hired candidate.

Use evidence events for dependent work. Do not put Move to Documents immediately
after Prepare application in the same graph: starting preparation does not mean
it has finished. The separate preparation-completed rule handles that transition.

## Feature fit and current limits

The current code and integration tests support different pipelines and document
orders per job, independent applications for the same person, multiple interview
stages, version-pinned configuration, and event-driven routing with guarded moves.
This supports the examples above; it is not evidence that every hiring policy is
configurable.

Current limits affecting a clean flow:

- There is no workflow step or supported rule that automatically approves real
  CVs. The demo's scripted owner decisions do not add that feature.
- Application preparation has its own account/contact review after CV approval.
  A future **Approve & prepare** experience could combine those decisions while
  retaining their guards. This demo does not remove either review.
- Conditions support source, applied position, job and stage, with Is / Is not.
  They cannot test interview Passed/Rejected, experience ranges, scores, arbitrary
  form answers or other custom fields. Do not automatically move every recorded
  interview decision to Offer.
- Telegram receipt does not identify a trusted job from free text. Job assignment
  remains explicit. A job-specific application link or bot selection would make
  intake clearer.
- Published pipeline changes apply to new applications. Existing applications
  retain their version and require an explicit stage mapping to change versions.
- Management is a single owner. Configurable stages do not provide multiple HR
  roles, departmental permissions, automatic offer sending or signatures.

Recommended next UX work is a job-specific setup guide and one application
checklist: Job → CV approval → Preparation → Documents → Interviews → Outcome.
Show the exact next action and waiting actor. Keep the automation canvas as a
configuration tool, and show which event/rule caused each automatic move.

## Reset and seed safely

The existing Deploy production workflow accepts an optional `demo_confirmation`.
Only `RESET DEMO KEEP ADMIN` runs `scripts/hiring-demo.mjs` after ordinary
validation and deployment, under the existing production concurrency lock.
Leaving it empty performs an ordinary deployment without resetting data.

The script signs into the existing `admin@gmail.com` account using the configured
owner secret, previews Reset all with definitions removed, rejects processing or
foreign-reference blockers, and submits that exact preview to the existing
owner-only reset API. The admin ID, password and integration configuration stay.
Minimal reset/audit receipts and anonymized Telegram deduplication receipts are
retained by the existing reset service; referenced files use durable background
cleanup. This is not an infrastructure or secret reset.

The script verifies administrator identity after cleanup, seeds through normal
application APIs, verifies the sample stages/account count and signs into the same
administrator again. Do not rerun after a successful setup: it would delete any
new test work. If seeding fails after cleanup, inspect the workspace and logs
before deciding whether another reset is appropriate.

Staff CV uploads may explicitly request `manualReview=true` to store a PDF for
manual review without invoking AI or recording a failed extraction. The demo uses
this path and supplies its synthetic profile through normal editing APIs.
