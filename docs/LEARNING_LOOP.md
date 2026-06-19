# Veil v1.3 — learning platform (JARVIS)

End-to-end: **capture from day one → train → signed bundle → on-device inference**.

## Product truth

Veil learns **copilot judgment** from user choices (metadata only). Secrets detection core stays regex + `intent-config.js`. The learned layer adjusts *when* to interrupt.

## Day-one capture (live now)

| User | What's captured | Upload |
|------|-----------------|--------|
| Everyone with copilot on | Decision events locally | Always buffered |
| Personal (default on) | Same | `POST /v1/platform/decisions` |
| Team | Same | `POST /v1/extension/events` |

Personal users: **anonymous signals on by default** — opt out in Settings → Help.

Feature schema v1: `extension/src/learning/feature-schema.js` (host, intent, field semantics, top category/confidence, fieldSigHash — no raw labels or matched text).

## Runtime stack (extension)

1. Detectors + `context-resolve` (hard rules)
2. `ambiguity.js` — hints + scorers from **signed `learningBundle`**
3. `safety.js` — never auto-suppress `api_key`, `jwt`, `password`, `credit_card` without ops + sample floor

## Platform brain

| Component | Purpose |
|-----------|---------|
| `learning_review_queue` | Override buckets |
| `learning_proposals` | Human/auto proposals |
| `platform_learning_hints` | Legacy hint rows |
| `learning_bundles` | Signed global + per-org bundles |

### Train pipeline (automated)

Auto-train is **on by default** (`LEARNING_AUTO_TRAIN` — set `false` to disable).

| Trigger | When |
|---------|------|
| **Ingest** | After team/personal decision upload — debounced 90s; runs when ≥20 new decisions and ≥4h since last train |
| **Daily backstop** | Once per day via ops monitor — analyzes always; publishes bundle only when ≥10 labeled samples |
| **Ops manual** | `/ops.html` → Learning → **Train now (force)** |

```bash
npm run learning:train    # CLI force train (same as Ops button)
npm run learning:analyze  # buckets + proposals only
```

Env tuning (Railway):

```
LEARNING_AUTO_TRAIN=true          # default on
LEARNING_TRAIN_COOLDOWN_HOURS=4
LEARNING_TRAIN_MIN_DECISIONS=20
LEARNING_TRAIN_MIN_SAMPLES=10
```

Ops → **Learning** tab shows automation status, last bundle version, and new decision count.

### Signed bundles

- `LEARNING_BUNDLE_SECRET` in `.env` → `npm run env:apply` → extension verifies HMAC
- `GET /v1/platform/learning-bundle?orgId=`
- Org sync/join attach `settings.learningBundle`

## Phases

| Phase | Status |
|-------|--------|
| A Instrumentation | ✅ |
| B Automated train + schema | ✅ |
| C Signed bundles | ✅ |
| D On-device scorer (logistic weights in bundle) | ✅ |
| E Org-private bundles (`settings.learningPrivate`) | ✅ API train path |

## Ops weekly

1. Check Learning tab override %
2. `npm run learning:train` after meaningful usage
3. Review auto-approved hints; manually approve edge cases
4. Watch false-positive tickets — they boost bucket priority

## Env (Railway + local)

```
LEARNING_BUNDLE_SECRET=<random hex>
OPS_CLIENT_INGEST_KEY=<random hex>
LEARNING_AUTO_TRAIN=true   # optional daily train
```

Run `npm run db:migrate` for migrations 013–015.

