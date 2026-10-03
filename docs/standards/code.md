# Coding standards

Apply these conventions to new code and touched areas without broad unrelated reformatting. Existing configuration is the source of truth for enforced rules.

## Language and formatting

Use TypeScript for application logic and preserve strict type checking. Model domain states explicitly and narrow unknown input before use. Avoid `any` and unchecked casts where validation or a concrete type can express the contract.

Follow the surrounding file's formatting. Most application TypeScript uses two-space indentation, double quotes, and semicolons; upstream UI primitives may differ. Keep imports readable and use the existing `@/` alias for application modules. Prefer named, focused helpers over large components with mixed data access and presentation.

ESLint enforces Next and TypeScript rules. There is currently no project-wide Prettier configuration or format script. Do not claim formatting is CI-enforced or reformat vendored `components/ui` as part of an unrelated change. Existing ESLint exemptions for upstream components are not permission to weaken feature checks.

## Module boundaries

Keep route handlers in `app/` thin: parse the request, call a feature service, and translate its response. Put domain services and their related UI/types in `features/<domain>/`. Put shared infrastructure in `lib/`, database definitions in `db/`, and reusable application patterns in `components/patterns/`.

Keep authentication, database, private storage, and secrets in server modules. Use `.server.ts` consistently with neighboring services and avoid importing them into client components. Reuse existing feature API/error helpers and DTO shapes instead of creating incompatible response envelopes. Do not expose database rows wholesale when they contain internal or sensitive fields.

## Validation, authorization, and failures

Validate body shape, size, identifiers, enum values, and permitted state transitions on the server. Browser validation improves feedback but is not authorization. Scope reads and mutations to the authenticated management owner, including linked records. Public recipient links and Telegram webhooks must retain their separate capability/signature checks.

Treat changes to approval, selected CV, account reuse, archive, and workflow execution as concurrent operations. Preserve revision checks, transaction/batch guards, unique constraints, and worker leases. Return a conflict with an actionable reload/review message when state changed; never silently overwrite a newer decision.

Return safe, useful errors through existing helpers. Log request IDs and safe diagnostic metadata rather than private CV contents, credentials, capability URLs, or raw provider payloads. Distinguish known failure from uncertain external delivery; do not automatically retry a send that may already have succeeded.

## Persistence and external effects

Update `db/schema.ts` and generate a new ordered migration with `npm run db:generate` when the schema changes. Inspect generated SQL and apply local migrations. Do not rewrite migrations already deployed. Keep file cleanup jobs in the same database batch as eligible record deletion.

Pin published workflow graphs, template versions, approved candidate values, and assignment snapshots. Preserve idempotent account/form creation and submission retries. Archive preserves evidence; permanent deletion must recheck eligibility and current revisions.

Paid AI needs an explicit confirmed user action. Bot uploads and workflows cannot initiate paid CV extraction. Tests must mock AI and Telegram and must not use production candidates or send real messages. Secrets belong in secure runtime/deployment settings, never committed fixtures or documentation.

## Checks and delivery

Use `npm ci` for reproducible setup; use `npm install` when dependencies change and include the lockfile. Application validation is:

```sh
npm run lint
npm run typecheck
npm run db:migrate:local
npm test
```

`typecheck` generates Cloudflare types before TypeScript checking. `npm test` builds and verifies production output before running the serial Node integration suite. Avoid running it against a live development server sharing the Vite cache.

Add meaningful coverage for changed authorization, transitions, concurrency, retries, persistence, or delivery behavior. Use existing SQLite D1 helpers and mocks. Simple documentation or visual-only adjustments do not need tests mirroring their implementation; validate links or browser behavior instead. Never disable a safety test to make a change pass.

Keep changes scoped and review the final diff for accidental generated files, secrets, unrelated formatting, and missing documentation. Production is deployed from `codex/pdf-studio-self-host` by GitHub Actions. Verify the exact published commit's result and report failures accurately; direct CLI deployment is not the normal publishing path.
