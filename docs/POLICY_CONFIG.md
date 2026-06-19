# Policy configuration (internal)

How Veil DLP rules are defined, what a **policy pack** is, and how custom JSON fits in.

## Layers (read bottom-up)

| Layer | Where set | What it does |
|-------|-----------|--------------|
| **Detection** | Extension code (`lib-bundle.js`, `field-semantics.js`) | Finds patterns (IBAN, PPS, API keys). Uses field labels and form context — not configurable via admin JSON. |
| **Company default pack** | Admin → Access | Default warn/block rules for everyone not on a sub-team. |
| **Sub-team pack or JSON** | Admin → Sub-teams → Set policy | Stricter or different rules for assigned members only. |
| **Personal profile** | Extension popup (personal users) | Local passphrase / secure mode — no org DLP. |

**Policy packs do not change what Veil detects.** They change what happens after detection: allow, warn, block, or auto-mask.

## What is a policy pack?

A **policy pack** is a named, pre-built rule set shipped with Veil (Observational, Finance, Engineering, Healthcare, GDPR). Each pack is a JSON object with:

- `enabled` — turn DLP enforcement on/off for that scope
- `defaultAction` — fallback when a category has no explicit rule (`allow` | `warn` | `block` | `auto_mask`)
- `categories` — per data type (e.g. `iban`, `national_id`, `api_key`)
- `aiSurfaces` — same shape, applied when pasting into AI chat tools

Packs are **catalog entries** in `portal/policy-packs.js` (mirrored to extension and API). They are not stored per customer until an admin applies one.

## Custom JSON overlay

Sub-teams can use:

1. **Select a pack** — saves the full pack DLP as that team's rules.
2. **Custom JSON** — paste only the keys you want to override relative to company default.

Use **Insert sample template** in the admin dialog for a commented starting structure.

### Example (Engineering-style sub-team)

```json
{
  "version": 1,
  "enabled": true,
  "defaultAction": "warn",
  "categories": {
    "api_key": { "action": "block", "minSeverity": "high" },
    "jwt": { "action": "block", "minSeverity": "high" },
    "national_id": { "action": "allow", "minSeverity": "high" },
    "iban": { "action": "warn", "minSeverity": "high" }
  },
  "aiSurfaces": {
    "defaultAction": "block",
    "categories": {
      "api_key": { "action": "block" },
      "jwt": { "action": "block" }
    }
  }
}
```

### Actions

| Action | Meaning |
|--------|---------|
| `allow` | Log only; no copilot prompt for enforcement |
| `warn` | Copilot suggests mask/remove; user can proceed |
| `block` | Prevent paste/send until resolved |
| `auto_mask` | Replace with Veil token automatically |

### Common categories

See `extension/src/policy/schema.js` for the full list. Frequently used: `national_id`, `iban`, `credit_card`, `api_key`, `jwt`, `ssn`, `email`, `phone`, `swift_bic`.

## Sync to extensions

After saving policy in admin, members pick up changes on next extension open or background sync. Ask them to reopen the extension if they need immediate effect.

## Related

- [CONTEXT_ENGINE.md](CONTEXT_ENGINE.md) — how detection uses field context (PPS vs IBAN, etc.)
- [ADMIN_GUIDE.md](ADMIN_GUIDE.md) — customer-facing setup steps
