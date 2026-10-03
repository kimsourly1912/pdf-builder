# PDF Builder

A browser-first PDF editor built with React, TypeScript, Vinext, PDF.js, PDF-Lib, Cloudflare Workers, D1, and R2.

PDF editing and selectable-text extraction run locally in the browser. D1 and private R2 storage persist reusable templates, candidate resumes, recipient links, and completed submissions.

## Features

- PDF upload, page navigation, reordering, rotation, and zoom
- Text, highlights, drawing, shapes, signatures, images, and form fields
- Checkbox/radio groups, dates, dropdowns, initials, and image placeholders
- Cambodia address fields with cascading province, district, commune, and village selection
- Khmer text rendering and export support
- Extract text, metadata, bookmarks, form fields, annotations, and attachments
- TXT, JSON, HTML, and edited/fillable PDF export
- Reusable templates, recipient roles, secure fill links, and submissions inbox
- Immutable published template versions pinned to every recipient link
- Expiring and revocable recipient links with configurable submission limits
- Idempotent submission retries that cannot create duplicate records
- Mobile layout, pinch zoom, keyboard shortcuts, undo, and redo
- Private, PDF-only Resume Library with multi-file intake and authorized preview/download
- Automatic extraction of common candidate details from selectable PDF text
- Candidate duplicate suggestions using normalized email and phone
- Editable candidate review with confidence, source-page, and verification state
- Explicit `candidate.*` template prefill keys copied as immutable assignment snapshots
- Hybrid AcroForm and visual AI field detection with source-aware deduplication and review-before-apply
- Durable detection runs with private R2 inputs, D1 status, queue retries, and resumable review
- Request IDs on every HTTP response for production incident correlation
- Durable R2 cleanup jobs retried every 15 minutes after partial storage failures
- SHA-256 verification before completed PDFs and resumes are downloaded

## Requirements

- Node.js 22.13 or newer
- npm
- A Cloudflare account for production deployment

## Run locally

```bash
npm ci
npm run db:migrate:local
npm run dev
```

Open the local URL printed by Vite. Local authentication uses the development
values in `wrangler.dev.jsonc`; create a local owner through Better Auth before
using the protected editor routes.

## Deploy to your Cloudflare account

The `Deploy production` GitHub Actions workflow is the canonical production
deployment. It creates or reuses the D1 database and R2 bucket, applies pending
migrations, creates the Better Auth owner when needed, removes the legacy
Cloudflare Access applications, deploys the Worker, and verifies protected and
public routes.

Configure these secrets in the GitHub Actions `production` environment:

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`
- `PDF_BUILDER_OWNER_PASSWORD` (at least 8 characters)
- `OPENAI_API_KEY` (required for AI field detection)

The owner password is used only by the deployment runner to create or verify
the configured owner account. The workflow generates the persistent Better
Auth signing secret directly in Cloudflare and never prints it. Public account
registration is blocked; a short-lived bootstrap secret is removed immediately
after the owner is verified.

To rotate a forgotten owner password, replace `PDF_BUILDER_OWNER_PASSWORD` in
the production environment and rerun deployment. If the stored credential no
longer matches, the temporary bootstrap process updates only the configured
owner account, revokes its existing sessions, verifies the new password, and
removes the bootstrap secret.

Pushes to `codex/pdf-studio-self-host` deploy the single production Worker.
There are no Cloudflare development or staging environments. The separate
`wrangler.dev.jsonc` file is only for local emulation.

For a manual production deployment:

1. Authenticate Wrangler:

   ```bash
   npx wrangler login
   ```

2. Create the database and file bucket:

   ```bash
   npx wrangler d1 create pdf-builder-db
   npx wrangler r2 bucket create pdf-builder-files
   ```

3. Copy the D1 `database_id` returned by Wrangler into `wrangler.jsonc`.

4. Apply the production migration:

   ```bash
   npm run db:migrate:remote
   ```

5. Build and deploy:

   ```bash
   npm run deploy
   ```

## Authentication and route protection

Better Auth email/password sessions protect the editor, templates, submissions,
and their management APIs. Sessions are stored in D1 and only
`admin@gmail.com` is accepted as the management owner.

The production workflow removes the former Cloudflare Access applications after
it proves that owner sign-in works. `/fill*`, `/api/fill*`,
`/api/gazetteer*`, `/api/auth*`, and static assets remain public; recipient
links continue to rely on their random capability tokens.

The relevant implementation files are:

- `lib/auth.ts`
- `app/api/auth/[...all]/route.ts`
- `app/sign-in/page.tsx`

The application does not trust caller-supplied identity headers.

## Useful commands

```bash
npm run lint
npm test
npm run build
npm run db:generate
npm run db:migrate:local
npm run db:migrate:remote
npm run deploy
```

## Storage model

- Browser storage: current local editing draft
- D1: Better Auth users/sessions, templates, recipient links, and submissions
- R2: source PDFs and completed PDFs

Recipient link tokens are random and only their SHA-256 hashes are stored in D1.
New links expire after 30 days and allow one submission by default. The owner can
rotate or revoke them from the templates dashboard. Each link stays pinned to
the exact published template version it was created for, and submission retries
reuse the original result through a client-generated idempotency key.

R2 deletion is coordinated through `storage_cleanup_jobs`. Destructive D1
operations enqueue their object keys in the same database batch, and a scheduled
worker retries failed cleanup every 15 minutes. This prevents a transient R2
failure from leaving untracked private files indefinitely.

## Cambodia Gazetteer

The Cambodia address field loads bilingual administrative data through
`/api/gazetteer`. The server route validates parent codes, normalizes the
external response, and allows shared caching for four hours. The browser never
calls the external service directly, so templates and recipient links use the
same stable contract.

Source data: https://cambo-gazetteer.manethpak.dev/api/docs

## Project guides and standards

Start with [AGENTS.md](AGENTS.md) for agent working instructions. The
[documentation index](docs/README.md) links UI and coding standards, architecture,
accepted decisions, the roadmap, and detailed candidate feature guides.

For an explicitly requested clean production test run, see [production reset](docs/production-reset.md). Ordinary deployment does not clear data.
