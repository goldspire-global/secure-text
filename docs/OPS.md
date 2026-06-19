# Veil platform operations (in-house)

Production observability without third-party APM. Metadata only — no secrets, no matched content.

## Dashboard URL

**API host only** (not on the public join portal):

```
https://veil-api.goldspireventures.com/ops.html
```

The join portal (`join-veil…`) returns 404 for `/ops.html` via the Cloudflare worker proxy.

## Environment variables (Railway)

| Variable | Purpose |
|----------|---------|
| `PLATFORM_OPS_TOKEN` | Bearer token for `/v1/ops/summary` and the ops dashboard |
| `OPS_CLIENT_INGEST_KEY` | Shared key for extension telemetry (`X-Ops-Ingest-Key` header) |
| `OPS_ALERT_WEBHOOK_URL` | Optional Slack/Discord/generic webhook for critical alerts |

Generate keys:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

After setting `OPS_CLIENT_INGEST_KEY` on Railway, add the same value to local `.env` and run `npm run env:apply` before packaging the extension.

## What is monitored

| Signal | Source |
|--------|--------|
| API + DB availability % | Health samples every 5 min |
| Portal synthetic checks | `join.html`, index, `/health` |
| API 5xx / latency by route | Request metrics (1-min buckets) |
| Extension failures | Batched client ops events |
| Org security events | Aggregate from `security_events` |
| Alerts | DB down, synthetic failure, API 5xx (30 min cooldown) |

Per-org detail remains in **admin.html** (security events, SIEM webhook).

## Customer support tickets

Feedback from **portal** (`feedback.html`) and the **extension** (popup + context menu) creates tickets via `POST /v1/support/tickets`. Each ticket gets a reference like `VLT-A1B2C3D4`.

| Field | Auto-captured |
|-------|----------------|
| Extension version, browser, profile | Yes |
| Org ID / name (team users) | Yes |
| Page host (no query secrets) | Yes |
| Copilot on/off, policy pack, DLP | Yes |
| Customer message + optional email | User provided |

Ops workflow in **`/ops.html` → Support tab**:

1. **New** — ticket in queue; also logged as `support_ticket` in Event log
2. **Investigating** — review diagnostics + related ops events (±24h, same version/host)
3. **Waiting on customer** / **Resolved** / **Closed** — ops notes + resolution text

Bug/security tickets trigger a Teams/Slack alert (same webhook as platform alerts).

API (ops token required):

- `GET /v1/ops/support/tickets?status=&kind=&q=`
- `GET /v1/ops/support/tickets/VLT-XXXXXXXX`
- `PATCH /v1/ops/support/tickets/VLT-XXXXXXXX` — `{ status, opsNotes, resolutionNotes, assignee }`

Migration: `012_support_tickets.sql` — run `npm run db:migrate` on deploy.

## Learning brain (JARVIS)

**`/ops.html` → Learning tab** — override analysis, automation status, review queue, rule proposals.

| Step | Action |
|------|--------|
| Capture | Extension logs copilot prompt vs user choice (`decision` events) |
| Auto-train | **On by default** — after enough new decisions or daily backstop |
| Review | Buckets sorted by override %; false-positive tickets boost priority |
| Ship | Auto-approve safe proposals + publish signed bundle; manual **Approve** for edge cases |

Migrations: `013`–`016` (`learning_train_runs` logs automation).

Deep analysis: [LEARNING_LOOP.md](LEARNING_LOOP.md), [analysis/README.md](../analysis/README.md).

### Learning env (Railway)

| Variable | Default | Purpose |
|----------|---------|---------|
| `LEARNING_AUTO_TRAIN` | `true` | Master switch |
| `LEARNING_BUNDLE_SECRET` | — | HMAC sign bundles (`npm run env:apply`) |
| `LEARNING_TRAIN_COOLDOWN_HOURS` | `4` | Min hours between ingest-triggered trains |
| `LEARNING_TRAIN_MIN_DECISIONS` | `20` | New decisions before auto-train |
| `LEARNING_TRAIN_MIN_SAMPLES` | `10` | Labeled samples before publishing bundle |

API: `GET /v1/ops/learning/status` — last run, bundle version, readiness.

## Alerts

Set `OPS_ALERT_WEBHOOK_URL` to a **Microsoft Teams** incoming webhook (recommended) or Slack URL.

### Microsoft Teams (Power Automate workflow)

Your Teams workflow expects an **Adaptive Card** (see setup: “card sent to this workflow's webhook”). Veil sends:

```json
{
  "type": "message",
  "attachments": [{
    "contentType": "application/vnd.microsoft.card.adaptive",
    "contentUrl": null,
    "content": { "...": "AdaptiveCard 1.4" }
  }]
}
```

Railway:

```
OPS_ALERT_WEBHOOK_TYPE=teams-webhook
OPS_ALERT_WEBHOOK_URL=<workflow webhook URL from Teams setup>
```

Use `OPS_ALERT_WEBHOOK_TYPE=text` only for old HTTP/manual flows that expect `{"text":"..."}`.

### Error: `UserNotAuthorizedToPerformAppOperationOnGroupChat` / Forbidden

The flow reached Teams but **Power Automate is not installed in that chat**. Fix in Teams (not in Veil):

1. Open **Microsoft Teams** → the **same chat** you picked in the workflow (group chat or meeting chat).
2. Click **+** (apps) at the top of the chat → search **Workflows** or **Power Automate** → **Add**.
3. If you used “chat with yourself” / a 1:1, try a **channel** instead: recreate the workflow from a **team channel** → **⋯** → **Workflows** → “Post when webhook received” — channels usually work more reliably for ops alerts.
4. In Power Automate, **Save** the flow and run **Test** again (or `POST /v1/ops/test-alert`).

### Map the message field

In **Post message in a chat or channel** (or **Post card**), set content from trigger body **`text`**:

`triggerBody()?['text']`

Veil sends: `{ "text": "title + body + timestamp" }`.

**Test from production** (after deploy):

```bash
curl -X POST "https://veil-api.goldspireventures.com/v1/ops/test-alert" \
  -H "Authorization: Bearer YOUR_PLATFORM_OPS_TOKEN"
```

Railway env:

```
OPS_ALERT_WEBHOOK_TYPE=powerautomate
OPS_ALERT_WEBHOOK_URL=<your Power Automate URL>
```

### Slack (alternative)

```
OPS_ALERT_WEBHOOK_TYPE=slack
OPS_ALERT_WEBHOOK_URL=https://hooks.slack.com/services/...
```

Alerts use a 30-minute cooldown per alert key to avoid spam.

## Migrations

```bash
npm run db:migrate
```

Requires `010_ops_hardening.sql` applied on production.

## Local smoke

```bash
npm run env:apply
npm run api:dev
# Open http://localhost:3015/ops.html
```
