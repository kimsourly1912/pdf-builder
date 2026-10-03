# Web form builder

The **Form Builder** sidebar entry opens `/forms`. The existing **PDF Templates** editor remains available separately as a reference and for existing assignments; this release does not migrate or remove it.

## HR flow

1. Create a form and add elements by clicking or dragging from the palette. Drag the handle to reorder, or use the Move up / Move down buttons. Configure labels, help, required answers, choices, validation, half/full row width, and optional candidate autofill in Settings. Section elements organize the form without collecting an answer.
2. Draft changes autosave with revision checks. Save draft is also available. Undo/redo affects the current editing history; reloading restores the saved draft. Field IDs and JSON keys remain independent of display labels and ordering; changing a JSON key is an explicit settings edit.
3. Optionally upload a source PDF and open **Map to PDF**. Select a field and draw its output box, then drag/resize it or edit its position and formatting. A field can have multiple placements across pages. Choice fields can map each option to a separate PDF checkbox. Unmapped fields still appear in response JSON. Replacing a draft PDF clears draft mappings; published versions retain their original file.
4. Preview the same form renderer used by candidates, including a narrow mobile layout, validation, sample photos/signatures and completed PDF output. Preview does not create a response. Text wraps and shrinks down to six points; output that still cannot fit reports an error instead of silently clipping.
5. Publish a version, then open **Assign / responses**. Assign the entire form to a managed account email. Every user completes all its fields, with no recipient role setup. Missing accounts have a direct Accounts link; assignment does not create authentication accounts or automatically send messages.
6. Candidates sign in, open their assigned form from My forms or its account-protected link, save a draft if needed, and submit. HR views answers, JSON export, uploaded images and completed PDF from Responses. Each assignment permits one response and stays pinned to its published version, including title, instructions, fields, mappings and PDF source.

A draft can contain unfinished email/date answers. Submission performs authoritative validation and preserves locked autofill snapshots. Photos and signatures use validated PNG/JPEG uploads, stored privately; image access checks the assigned account or management owner. JSON export includes authorized image URLs, not private storage keys.

## Failure and history behavior

Template saves, publishing, PDF replacements and candidate draft/submission saves use database revision guards. A stale save reports a conflict rather than overwriting another change. Final submission is idempotent and marks the assignment complete in the same transaction that stores immutable answers.

PDF generation happens **after** answers are saved. Pending artifacts can be completed by scheduled processing; failed generation can be retried by HR using the pinned source, mapping and answers. A storage/font failure never asks a candidate to submit again. If text exceeds its published box, JSON remains complete; enlarge the draft mapping and publish a corrected version for future assignments. Retrying an existing response cannot change its published layout.

Forms use the existing archive and protected-history rules. Archiving a form removes it from active builder lists and prevents new assignments. Existing account assignments retain their pinned history. Templates with assignments/submissions cannot be permanently deleted.

## Implementation

- `features/forms/form.ts`: Zod definitions, stable identities, answer validation and the compatibility adapter.
- `features/forms/form-builder.tsx`: draft editor with `@dnd-kit/react` sorting and keyboard/button alternatives.
- `features/forms/form-renderer.tsx`: shared React Hook Form + Zod renderer; `signature_pad` for drawing signatures.
- `features/forms/pdf-mapper.tsx`: PDF.js page rendering and `react-rnd` bounded placements.
- `features/forms/form.server.ts` / `submission.server.ts`: owner/account authorization, versioning, private assets, guarded writes and leased PDF recovery.
- `drizzle/0024_form_builder.sql`: additive schema and revision guards. Existing template kinds default to `pdf`; new forms use `form`.

A private single-user role adapter allows the existing workflow runner, account assignments and progress projections to reuse their guards without exposing recipient roles in the new builder. Workflows can select published web forms alongside existing PDF templates. New forms cannot be edited through legacy recipient-template APIs.

Libraries are pinned in the lockfile. This release uses the current `@dnd-kit/react` adapter rather than mixing it with the older core/sortable APIs. SurveyJS Creator is not included because its commercial editor licensing does not match the chosen open-source composition.

## Validation and remaining product scope

Integration tests cover authorization, definition validation, revisions, private media, pinned versions, idempotency, concurrent revocation, JSON-only submission, Khmer/rotated PDF output, overflow and PDF retries. Browser verification covers builder interactions, mapping, responsive preview and the candidate submission path.

The account-protected email assignment model is intentional: unauthenticated Google Forms-style public collection, bulk emailing, conditional sections, correction requests, and retirement/migration of legacy templates need separate product decisions. This guide does not claim those capabilities exist.
