# AI field detection — Phase 1

Phase 1 is an owner-only evaluation prototype. It analyzes a PDF, returns
reviewable field candidates, and adds only the candidates explicitly accepted in
the editor. It never saves or publishes a template automatically.

## Limits

- PDF only, validated with the existing PDF inspection.
- Maximum 12 MB and 20 pages per analysis.
- Supported AI tools: input, textarea, dropdown, checkbox, and date.
- Low-confidence candidates are not preselected.
- Dropdown candidates without at least two options are downgraded to input.

## Configuration

Set the API secret without committing it:

```bash
npx wrangler secret put OPENAI_API_KEY
```

The optional non-secret `OPENAI_FIELD_DETECTION_MODEL` variable defaults to
`gpt-5.6`. The provider and model name are isolated from template logic so they
can be changed after evaluation.

## Evaluation dataset

Copy `evaluation/ai-field-detection.example.json` to
`evaluation/ai-field-detection.json`. For each representative PDF, record the
manually verified expected fields and the AI candidates returned by the editor.
Use normalized top-left coordinates between 0 and 1.

The initial dataset should contain at least 30 documents:

- 10 English digital PDFs
- 10 Khmer digital PDFs
- 5 English scanned PDFs
- 5 Khmer scanned PDFs
- Single-page and multi-page layouts
- Text inputs, dates, checkboxes, text areas, and visible option lists

Run:

```bash
npm run ai:evaluate
```

Phase 1 passes when aggregate recall is at least 90%, tool accuracy is at least
85%, and at least 80% of matched field boxes have an intersection-over-union of
0.5 or higher.

Do not add advanced tool types or automatic publishing until the dataset meets
these targets.
