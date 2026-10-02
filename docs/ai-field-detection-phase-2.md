# AI field detection — Phase 2

Phase 2 moves analysis out of the upload request and gives every analysis a
durable, owner-scoped lifecycle. The editor still requires explicit review
before any field is added and never publishes a template automatically.

## Lifecycle

1. `POST /api/ai-field-detection/runs` validates the PDF, saves a private R2
   source object, creates a D1 run in `queued`, and publishes only the run ID to
   Cloudflare Queues.
2. The Worker's `queue()` handler atomically claims the run, loads the private
   source, calls the provider, and stores the normalized result and token usage.
3. The editor polls the owner-scoped run endpoint until the result is ready.
   The active run ID is included in the browser draft so a reload can resume it.
4. `PATCH /api/ai-field-detection/runs/:id` validates edited labels, keys, and
   tools against the server result and persists the accepted candidates.
5. The private analysis source is deleted after review. Configure an R2
   lifecycle rule as a second cleanup boundary for abandoned sources.

Queue delivery is idempotent. Only queued, failed, or processing runs stale for
ten minutes can be claimed. Provider failures retry up to three deliveries;
terminal failures expose only a sanitized message to the editor.

## Production configuration

Create the production queue once (the deployment script also does this
idempotently):

```bash
npx wrangler queues create pdf-builder-ai-field-detection
```

Configure the provider key as a GitHub Actions `production` environment secret
named `OPENAI_API_KEY`, or set it manually with Wrangler:

```bash
npx wrangler secret put OPENAI_API_KEY
```

Then apply migration `0010_ai_field_detection_runs.sql` and deploy. The Worker
is both the queue producer and consumer through the
`AI_FIELD_DETECTION_QUEUE` binding.

## Operational checks

- Alert on runs that remain `processing` for more than ten minutes.
- Track terminal failure rate and token usage from D1.
- Set an R2 lifecycle rule to expire the `ai-field-detection/` prefix after one
  day so abandoned uploads cannot remain indefinitely.
- Keep the Phase 1 evaluation thresholds as the quality gate for widening the
  supported tool set.
