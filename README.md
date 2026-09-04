# PDF Builder

A browser-first PDF editor built with React, TypeScript, Vinext, PDF.js, PDF-Lib, Cloudflare Workers, D1, and R2.

PDF editing and content extraction run locally in the browser. D1 and R2 are used only for reusable templates, recipient links, and completed submissions.

## Features

- PDF upload, page navigation, reordering, rotation, and zoom
- Text, highlights, drawing, shapes, signatures, images, and form fields
- Checkbox/radio groups, dates, dropdowns, initials, and image placeholders
- Khmer text rendering and export support
- Extract text, metadata, bookmarks, form fields, annotations, and attachments
- TXT, JSON, HTML, and edited/fillable PDF export
- Reusable templates, recipient roles, secure fill links, and submissions inbox
- Mobile layout, pinch zoom, keyboard shortcuts, undo, and redo

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

Open the local URL printed by Vite. Local template management uses `owner@localhost` as the development owner.

## Deploy to your Cloudflare account

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

## Protect template management

The editor and recipient fill links can remain public. The management routes expect an authenticated email from Cloudflare Access using the `Cf-Access-Authenticated-User-Email` header.

Protect these paths with Cloudflare Access and allow only your account:

- `/templates*`
- `/api/templates*`
- `/api/submissions*`

Keep `/fill/*` public so recipients can use their secure token links.

If you deploy behind another authentication provider, update these files to read its verified identity header:

- `app/chatgpt-auth.ts`
- `features/templates/template.server.ts`

Never trust an email header sent directly by a public client. It must be set and protected by your reverse proxy or identity provider.

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
- D1: templates, recipient links, and submission records
- R2: source PDFs and completed PDFs

Recipient link tokens are random and only their SHA-256 hashes are stored in D1.
