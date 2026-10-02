# AI field detection — Phase 3

Phase 3 adds a hybrid detector. PDF Studio now reads embedded AcroForm widgets
deterministically before visual AI analysis, then merges the two sources into a
single owner-review queue. Review is still mandatory: detection never publishes
a template or adds fields without the owner applying the reviewed candidates.

## Detection pipeline

1. The queue worker loads the private source PDF from R2.
2. PDF-Lib extracts writable AcroForm widgets, their names, required flags,
   options, page references, and rectangles.
3. Widget rectangles are converted from PDF coordinates to normalized
   top-left coordinates, including crop offsets and rotations of 0, 90, 180,
   and 270 degrees.
4. The visual model receives the embedded widgets as known fields. It is asked
   to find only additional printed or scanned fields, except when a visual
   match can improve a generic embedded label.
5. Candidates on the same page are deduplicated using rectangle overlap and
   label similarity. The embedded widget keeps the authoritative geometry,
   tool, and key; the visual match can improve a generic label or validation.
6. The durable D1 run stores the merged result and pipeline counts in its
   existing `result_json` column. No Phase 3 database migration is required.

## Embedded field mapping

| AcroForm field | PDF Studio tool | Notes |
| --- | --- | --- |
| Single-line text | Input | Infers email, phone, or number validation from the name or tooltip. |
| Multi-line text | Textarea | Preserves the embedded required flag. |
| Date-named text | Date picker | Recognizes names such as `date`, `dob`, and `birthDate`. |
| Dropdown / option list | Dropdown | Requires at least two distinct options; otherwise falls back to input. |
| Checkbox | Checkbox | Maps only an independent checkbox widget. |

Read-only fields are counted but not suggested. Buttons, radio groups,
signatures, and other unsupported AcroForm types are counted but are not
silently mapped to an incorrect tool. The supported set remains the five tools
approved for the initial rollout.

## Review provenance

Each suggestion displays one source badge:

- **Embedded form** — extracted directly from an AcroForm widget.
- **Form + AI** — an embedded widget enriched by a visual AI match.
- **Visual AI** — a printed or scanned field found only by visual analysis.

Older Phase 1 and Phase 2 stored results do not contain provenance. The review
UI treats those candidates as AI suggestions so existing runs remain usable.

## Operational validation

Before deployment, run:

```bash
npm run lint
npm run typecheck
npm test
npm run ai:evaluate evaluation/ai-field-detection.example.json
npx wrangler deploy --dry-run
```

Continue using the Phase 1 quality thresholds. Add representative fillable,
flattened, scanned, rotated, and mixed PDFs to the private evaluation set, and
track `duplicatesMerged`, `readOnlyAcroFormFields`, and
`unsupportedAcroFormFields` from completed run results when diagnosing quality.
