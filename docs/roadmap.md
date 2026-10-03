# Roadmap and current status

As of 2026-10-03. This page focuses on the recent candidate intake, workflow, archive, and progress work. Git history and GitHub Actions remain the source of truth for publication and deployment; this page is not a deployment log.

## Shipped capability

| Area | Current behavior |
| --- | --- |
| Telegram intake | Contact and original PDF collection without automatic paid AI or login creation; explicit additional/replacement CV actions and application status. |
| CV review | Optional confirmed AI, manual editing, separate Save changes and Approve CV, current-revision approval, unsaved-change safeguards. |
| Preparation workflows | Purpose presets and starting events; guarded review/account reuse; CV linking, pinned forms, Telegram activation/sign-in invitations, recovery and history. |
| Intake guidance | One next-step summary, actual progress, direct missing-requirement actions, selected CV context, state-specific preparation actions. |
| Archive | Linked intake/CV groups, restore, eligibility and protected-history explanations, limited Undo, guarded permanent deletion and durable file cleanup. |
| Candidate Progress | Candidates sidebar submenu, Kanban/List toggle, guarded dragging/menu transitions, CV/run selection, forms, and timeline. |
| Progress usability | Saved owner-scoped filters/view, useful page/column counts, event-based waiting times, sorting, consistent status presentation, issue-resolution links, responsive layouts. |

Feature details live in the [documentation index](README.md). Automated integration and browser checks have covered the recent changes; actual HR usability sessions remain useful and are listed below.

## Proposed next improvements

These ideas are not implemented or scheduled by this roadmap. They need their own agreed scope before development.

| Priority | Proposal | Intended outcome and design question |
| --- | --- | --- |
| High | HR acceptance review after forms arrive | Distinguish Ready for HR from reviewed/accepted. Decide the review checklist, outcomes, and whether corrections reopen particular forms. |
| High | Safe Telegram reminder controls | Preview the message, show the last reminder, require explicit sending, and prevent duplicate/uncertain sends. Decide timing and allowed recipients. |
| Medium | Assigned HR owner and internal notes | Clarify responsibility and handoffs. Multi-HR authentication and access rules must be designed before owner assignment is more than a label. |
| Medium | Expand the existing candidate timeline | Include replacement events and additional HR decisions in the timeline that already shows approval, preparation, invitations, forms, and stage changes. |
| Medium | HR usability sessions | Test multiple CVs, failed/uncertain invitations, incomplete forms, archives, and mobile work with real HR users using safe test data. |

## Maintenance

When work ships, move it into the shipped table and update the relevant feature guide and decisions. Keep proposals concrete; do not assign invented completion dates or call a proposal approved because it appears here. Record detailed validation evidence in the commit/PR and GitHub Actions rather than maintaining duplicate test counts in this page.
