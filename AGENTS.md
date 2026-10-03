# Working on PDF Studio

## Start here

PDF Studio is a React/TypeScript application using Next App Router APIs through Vinext/Vite, deployed to Cloudflare Workers with D1 and private R2 storage. This repository includes candidate intake, CV review, preparation workflows, forms, and candidate progress.

Read this guide first. Read only the documentation relevant to the task:

- [UI standards](docs/standards/ui.md): layouts, actions, status, accessibility, and responsive behavior.
- [Coding standards](docs/standards/code.md): boundaries, validation, persistence, and checks.
- [Architecture](docs/architecture.md): runtime and feature map.
- [Decisions](docs/decisions.md): product and technical constraints to preserve.
- [Roadmap](docs/roadmap.md): shipped work versus proposed improvements.
- [Documentation index](docs/README.md): detailed feature guides.

User instructions determine scope. These documents guide implementation; roadmap proposals do not authorize feature development. Check the current code when a document appears stale and update the relevant documentation with the change.

## Repository map

- `app/`: routes, pages, and API adapters.
- `features/`: domain logic, server services, client components, and feature types.
- `components/ui/`: shared upstream UI primitives; preserve their conventions.
- `components/patterns/`: reusable application layouts and feedback patterns.
- `lib/`: shared infrastructure, authentication, and utilities.
- `db/` and `drizzle/`: schema, database access, and ordered migrations.
- `worker/index.ts`: HTTP entry point, scheduled processing, and queues.
- `scripts/` and `tests/`: deployment, build verification, and integration coverage.

Prefer extending an existing feature or shared pattern over creating a parallel implementation. Keep server-only dependencies out of client bundles. Follow nearby formatting and avoid unrelated rewrites.

## Local setup and checks

Use Node 22.13 or newer. Follow [README](README.md) for local configuration:

```sh
npm ci
npm run db:migrate:local
npm run dev
```

For application changes, run appropriate checks before publishing:

```sh
npm run lint
npm run typecheck
npm run db:migrate:local
npm test
```

`npm test` builds the production application first. Do not run it alongside a development server sharing Vite's cache. When dependencies change, use `npm install` and commit `package-lock.json`. For documentation-only changes, check links, paths, command names, and the diff; application tests need not be rerun locally. Browser-check changed screens at desktop and mobile sizes, including empty, loading, failure, and relevant workflow states.

## Preserve these guarantees

- Enforce management-owner authorization on server reads and writes; never trust client identity or identity headers. Recipient capabilities and Telegram webhooks have their own validation.
- Candidate intake records are not authentication accounts. Bot uploads and workflow execution never initiate paid CV extraction; AI requires an explicit confirmed editor action.
- Save changes and Approve CV are separate. Approval can trigger published workflows and must retain current-revision proof and review guards.
- Do not bypass published-graph review gates, account reuse confirmation, pinned template versions, leases, idempotency, or database batch guards.
- Telegram delivery success means sent, not read. Uncertain delivery requires explicit checking/resend; never send temporary passwords through Telegram.
- Archive before permanent deletion. Preserve protected history, revision checks, and transactional storage-cleanup jobs.
- Do not log or commit tokens, passwords, private CV contents, production exports, or local credentials. Mock external sends and paid AI in tests.

## Publishing and documentation

`codex/pdf-studio-self-host` is the production deployment branch. Pushing to it triggers `.github/workflows/deploy-production.yml`; it is not a staging branch. Follow the user's publishing instructions. When publishing is authorized, verify GitHub Actions for the exact commit and report any deployment blocker. `main` is not the current application/deployment target.

Update feature documentation when behavior changes, the decision log when a durable constraint changes, and the roadmap when a proposal ships. Keep this guide short; detailed examples belong in linked documents. Never invent test results or deployment success.
