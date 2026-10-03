# Roadmap and current status

As of 2026-10-03. This page focuses on the recent candidate intake, workflow, archive, and progress work. Git history and GitHub Actions remain the source of truth for publication and deployment; this page is not a deployment log.

## Shipped capability

| Area | Current behavior |
| --- | --- |
| Telegram intake | Contact and original PDF collection without automatic paid AI or login creation; explicit additional/replacement CV actions and application status. |
| CV review | Optional confirmed AI, manual editing, separate Save changes and Approve CV, current-revision approval, unsaved-change safeguards. |
| Preparation workflows | Interactive horizontal canvas, connected insertion, searchable drag/drop catalog, immediate settings, undo/redo, autosave and visual execution inspection; purpose presets and starting events; guarded review/account reuse; CV linking, pinned forms, Telegram activation/sign-in invitations, recovery and history. |
| Intake guidance | One next-step summary, actual progress, direct missing-requirement actions, selected CV context, state-specific preparation actions. |
| Archive | Linked intake/CV groups, restore, eligibility and protected-history explanations, limited Undo, guarded permanent deletion and durable file cleanup. |
| Candidate Progress | Candidates sidebar submenu, Kanban/List toggle, guarded dragging/menu transitions, CV/run selection, forms, and timeline. |
| Web form builder | Click/drag fields, reorder, shared candidate preview, separate PDF mapping, immutable whole-form assignments, private media, JSON/PDF responses and PDF retry; legacy PDF templates remain available. |
| HR workspace | Task-based Home/navigation, tabbed candidate profile, centered reading containers, HR form acceptance and new correction attempts preserving original history. |
| Progress usability | Saved owner-scoped filters/view, useful page/column counts, event-based waiting times, sorting, consistent status presentation, issue-resolution links, responsive layouts. |

Feature details live in the [documentation index](README.md). Automated integration and browser checks have covered the recent changes; actual HR usability sessions remain useful and are listed below.

## Proposed next improvements

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
