# UI and UX standards

Apply these standards to new screens and changes to existing screens. Existing screens may need gradual improvements; this document is not a claim that every screen already complies.

## Layout and visual language

Use `components/patterns/app-shell.tsx` and `page-header.tsx` for application pages. Center reading, review, table and card-list pages in a single `max-w-7xl` (80rem) shell container. Use full width for interactive studios, form builders, workflow canvases and the candidate Kanban. The candidate List view uses the centered container. Avoid nesting a narrow page container inside an already constrained shell.

Reuse `components/ui/` primitives and `components/patterns/` feedback, status, pagination, and data-view components. Use existing Tailwind theme tokens for background, border, text, and focus states; support dark mode. Follow nearby spacing, type sizes, and corner styles rather than introducing a second visual system. Prefer shared variants over copied component markup.

Appearance uses the root `next-themes` provider with Light, Dark, and System options, persisted on the device. Use the shared `ThemeToggle` in page headers outside the management shell. Keep PDF paper and signature canvases white so document output stays faithful; surrounding controls must use theme tokens. Workflow and execution canvases follow the resolved theme. Check both themes and system preference changes without changing document colors.

Keep related controls at least `gap-2` apart and distinct page sections `gap-6`/`space-y-6` apart. Action rows must wrap on narrow screens. Avoid unlayered global font shorthands on controls: they override Tailwind text sizes and make compact toolbars grow unexpectedly.

Use one clear page title, a short purpose description, and a visible next action. Put supporting details below the decision the user needs to make. Product copy should describe the HR task, not database, queue, or implementation details.

## Controls and field spacing

Use the installed shadcn primitives for application controls: `Button`, `Input`, `Textarea`, `Select`, `Checkbox`, `RadioGroup`, and the existing dialog/menu components. Do not use native `<select>` or `NativeSelect` in application screens, including filters, toolbars, form previews, and PDF dropdown overlays. ESLint enforces this rule outside the vendored primitives. Do not add another control library for these tasks.

Use `components/patterns/select-field.tsx` for controlled dropdowns when convenient. It composes shadcn Select and supports numeric values, empty/clear options, a placeholder, and a focusable trigger. Its `onValueChange` callback receives a string; convert numeric values explicitly. Retain control IDs used by labels and setup diagnostics, disabled states, form names, and validation focus refs. A clear item must produce an actual empty value, never an internal sentinel in submitted data.

Every label and its input need an explicit field wrapper, including inside settings panels and dialogs:

```tsx
<div className="space-y-2">
  <Label htmlFor="form-layout">Layout</Label>
  <SelectField id="form-layout" value={layout} onValueChange={setLayout}>
    <SelectFieldOption value="full">Full width</SelectFieldOption>
    <SelectFieldOption value="half">Half width</SelectFieldOption>
  </SelectField>
</div>
```

Keep field groups `space-y-4` apart and major sections `space-y-6` apart. Use `flex flex-wrap items-center gap-2` for action rows and toolbars; grid children also need an explicit gap. A parent's section gap does not create spacing between a label and the input inside its child. Do not repair spacing with global label margins or empty spacer elements. Use `min-w-0` on shrinking containers and `w-full` on full-width field triggers; compact toolbar selectors should keep their intrinsic width. Reserve an error-message row when validation runs on blur so errors cannot move the submit button during a click. Only reference existing help/error IDs in `aria-describedby`.

Use Checkbox's `onCheckedChange` (`checked === true`) and RadioGroup's `onValueChange`; preserve labels and keyboard selection. Use the shared `components/ui/date-picker.tsx` (shadcn Calendar + Popover) for application dates, including follow-up dates and scheduling dialogs. For date/time appointments, pair it with shadcn Select hour/minute and AM/PM controls and a labeled timezone selector. Do not use native `date`, `datetime-local`, `time`, or `<datalist>` pickers in management screens. Validate required calendar values explicitly, focus the missing control, retain entered values, and support clearing optional dates.

Native file/color pickers and document-coordinate text/drawing controls are legitimate browser/document controls. Native dates are permitted only in PDF-coordinate overlays in `app/pdf-editor.tsx` and `features/templates/recipient-fill.tsx`, where their appearance must preserve PDF geometry. This exception does not apply to ordinary management controls or native dropdowns. ESLint enforces the picker prohibition with only these explicit PDF date exceptions. Document overlays can customize the Select trigger's dimensions/color and hide its default icon when a scaled PDF icon is already present; the popup still uses the themed shadcn component.

Before finishing UI changes, search the touched screens for native controls and missing field/control-row gaps. Open dropdowns in dialogs, test Escape and arrow keys, clear an optional value, and verify long options, disabled states, validation focus, both themes, and narrow screens. Keep popup content inside the viewport and ensure spacing fixes do not hide overflow. These checks are part of delivery, not an optional visual polish step.

## Actions and progress

Show one primary next action for the current state. Replace unavailable or already-running actions with View progress, Resolve issue, or the appropriate completed-state link. Explain a disabled action's missing requirement and provide a direct path to fix it.

Keep Save changes separate from Approve CV. Beside approval, explain that it may start a published workflow. Confirm consequential actions such as paid AI, account reuse, uncertain Telegram resends, and permanent deletion. Do not add confirmations to routine navigation or reversible draft saves.

Derive operational status from the shared progress model and evidence. Do not infer approval from AI extraction, form submission from assignment, or a read receipt from Telegram delivery. Manual Kanban stages must remain distinguishable from actual preparation facts. Reuse `features/candidate-progress/presentation.ts` for candidate status language and colors:

| Meaning | Color family |
| --- | --- |
| Neutral or new | Slate / neutral |
| Waiting or needs attention | Amber |
| Approved or preparing | Blue |
| Completed | Green |
| Failed or rejected | Red |

Always include a text label. CV approved does not mean a workflow is configured or contact is confirmed. Ready for HR does not mean HR has accepted the application.

## Interview detail pages

Lead with candidate identity, current status, a short step overview, and one clear next action. Explain what remains before the next step can proceed. Keep round appointments and required feedback together; show the newest round first. Separate documents and activity history into labeled shadcn tabs rather than placing them ahead of the current task. Use an explained Manage status dialog for pause, withdrawal, reopening and correction; keep appointment cancellation/no-show in the round’s contextual shadcn menu. Keep the final-decision panel above the rounds, with visible readiness requirements and paths to resolve missing feedback. Label the transition Prepare final decision and explain that it unlocks an outcome rather than closing the process. Final outcomes require an explicit selection, never a preselected default.

Use plain task language: “Interview took place” and “Candidate did not attend (no-show)”. Explain that no-show records attendance and does not reject a candidate. Disable attendance actions until the scheduled start and state why. Completing feedback should offer final review directly while still allowing another round. Draft feedback must remain visibly outstanding. Group round appointment details, use feedback/status/recommendation badges with text, and show scores explicitly out of five. Display and enter appointment time in AM/PM while preserving timezone and server time validation. Use an action list by default for Interview Progress, with work queues, blockers, next actions and status age; retain the optional stage board. Guide appointment entry through people, date/time, location and a review summary. Keep dialog actions and validation errors visible in the footer of long forms. Use separate Save draft and Submit feedback controls with rating guidance and compare submitted assessments at final review. Show later preparation changes separately from accepted evidence. Candidate appointment messages must be previewed/editable and copied explicitly, with copying distinct from sending. Keep history compact and paginated, with full detail dialogs. Preview accepted documents in read-only dialogs and provide an ordered Interview guide without leaving the page. Keep consequential actions in reason/confirmation dialogs and preserve server guards.

## Candidate and CV context

Show which candidate, CV, and preparation run an action affects. Preserve Latest submission, Currently viewing, and Previously approved labels. Confirmations should include the selected filename; replacement should identify the CV being archived. Keep full filenames accessible in detail even when selectors truncate them.

Intake summarizes bot contact details, verification, and next steps. CV editing and optional AI belong in the Resume Editor. Preserve unsaved-change indicators and guards; do not overwrite a draft silently. Use archive and restoration flows consistently, with protected-history reasons visible before deletion is attempted.

## Responsive and accessible interactions

Use a single-column layout on small screens with `min-w-0` where flex/grid children must shrink. Keep Kanban boards and wide tables scrollable inside their own containers. Check actual element bounds: a shell that hides overflow can conceal clipped controls even when the document has no horizontal scrollbar.

Use semantic buttons and links, visible focus states, accessible names for icon buttons, and labels for inputs. Dialogs must support keyboard navigation and return focus to the triggering control. Provide a Move to menu as an alternative to dragging. Do not rely on color, hover, or drag alone to communicate state or make an action available.

Preserve search, sorting, filters, page, and view preferences using existing feature helpers and owner scope. Show both visible counts and overall matching counts when pagination makes a Kanban column partial. Offer Clear filters and a useful empty-state next action.

## Feedback and verification

Provide loading, empty, success, error, and permission states. Prevent duplicate submissions while a mutation is running. Errors should say what failed and what the user can do next; retain entered data where possible. Never display raw exceptions or credentials.

For UI changes, verify desktop and mobile layouts, keyboard access, long names/filenames, empty results, and the affected progress states. Check actual interactions, not only screenshots. Use mocked/local candidate data and external services; production smoke checks should not create applications or send invitations.

When renaming a management page, update the authenticated deployment smoke contract in `scripts/deployment-pages.mjs`. The check must match the real page heading, not a sidebar label or serialized component text. New management entry pages belong in the deployment verification list.


## Workflow canvas workspace

The workflow editor is a dedicated full-viewport workspace, without the management sidebar or permanent execution/settings tabs. Keep a compact header for Back to Automation, workflow name, saved/live status, Test with sample, Save draft and Review & publish. Executions, settings, publication history and comparison remain available through More actions. Testing sample data must never run real account creation, assignments or sends.

Show the searchable step picker only when requested, beside the insertion point where possible. Show a contextual inspector for one selected node; use a bottom sheet on phones. Multi-selection exposes Align and Distribute rather than an inspector for an arbitrary selected node. Keep one drag or alignment operation one undoable edit. Preserve text editing shortcuts in inputs and dialogs. Fit changes only the viewport; Auto-arrange changes positions. Fit measured nodes on first entry and restore the owner/workflow-scoped viewport on return. Pink edge/center guides provide gentle snapping; Alt/Option bypasses it. Hand/Space pans; Select/marquee and Shift-click select.

Form response lists separate person identity, recorded account category and HR review status. Do not describe Candidate/Employee categorization as recipient permissions. Use an account picker with name/email suggestions, show already assigned for the current published version, and retain server authorization/uniqueness checks. Assignment does not send an invitation. Show human-readable answers and Not answered for empty values; PDF generation state is separate from saved answers and HR decisions. Keep technical JSON in export actions.
