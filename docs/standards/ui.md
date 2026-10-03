# UI and UX standards

Apply these standards to new screens and changes to existing screens. Existing screens may need gradual improvements; this document is not a claim that every screen already complies.

## Layout and visual language

Use `components/patterns/app-shell.tsx` and `page-header.tsx` for application pages. Operational screens such as Intake, Progress, and Workflows should use the available content width; constrain reading text and forms where it improves comprehension. Avoid nesting a narrow page container inside an already constrained shell.

Reuse `components/ui/` primitives and `components/patterns/` feedback, status, pagination, and data-view components. Use existing Tailwind theme tokens for background, border, text, and focus states; support dark mode. Follow nearby spacing, type sizes, and corner styles rather than introducing a second visual system. Prefer shared variants over copied component markup.

Use one clear page title, a short purpose description, and a visible next action. Put supporting details below the decision the user needs to make. Product copy should describe the HR task, not database, queue, or implementation details.

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
