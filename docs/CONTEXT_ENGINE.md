# Context engine (internal)

Honest description of how Veil decides **what** something is before DLP policy runs.

## Not machine learning

The context engine is a **deterministic pipeline**: regex detectors + field semantics + intent heuristics. It does not learn from customer data. Configuration is:

- **Code** — patterns in `intent-config.js`, detectors in `lib-bundle.js`, semantics in `field-semantics.js`
- **Runtime DOM** — labels, placeholders, `autocomplete`, form presence, URL host/path
- **Org policy** — applied **after** detection in `GoldspirePolicyEngine.evaluate()` (warn/block only)

If a string looks like multiple things (e.g. `2193825B` = Irish PPS vs partial IBAN), disambiguation uses **field semantics**, not a second hardcoded guess inside the IBAN detector.

## Pipeline

```
DOM target
  → observe/context.js (field hints, intent)
  → field-semantics.js (label → expected categories)
  → engine.analyze() (regex detectors)
  → context-resolve.js (suppress/prefer by semantics)
  → gating.js (copilot / DLP prompts)
  → policy engine (org pack: warn/block)
```

## Field semantics (`field-semantics.js`)

Declarative rules map labels/autocomplete to:

- `suppressCategories` — unlikely in this field (e.g. `swift_bic` in a name field)
- `preferCategories` — likely in this field (e.g. `national_id` when label says PPS)

| Semantic id | Example labels | Effect |
|-------------|----------------|--------|
| `person_name` | First name, Student name | Suppress api_key, SWIFT, IBAN in name fields |
| `government_id` | PPS, SSN, National ID | Prefer national_id; suppress IBAN without country prefix |
| `payment_account` | IBAN, Sort code, SWIFT | Prefer payment categories; suppress national_id when value looks like IBAN |
| `contact` | Email, Phone | Prefer email/phone |
| `secret_credential` | API key, Token, Password | Prefer secrets; suppress PII false positives |

Semantics are **data-driven in one file** — add a label pattern there instead of patching individual detectors.

## PPS vs IBAN example

| Input | Field label | Detector hits | After context-resolve |
|-------|-------------|---------------|------------------------|
| `2193825B` | PPS Number | `national_id`, maybe `iban` | `national_id` only — no `IE` prefix, gov-id field |
| `IE29AIBK93115212345678` | Bank account | `iban` | `iban` kept |
| `stafford` | First name | `swift_bic` (lowercase) | Suppressed — typed name in name field |

## What is still “hardcoded”

| Component | Hardcoded? | Notes |
|-----------|------------|-------|
| Regex detectors | Yes | Patterns in `lib-bundle.js` / detector modules |
| Field semantics | Yes, but centralized | `field-semantics.js` — single place to extend |
| Intent (form vs compose) | Yes | `intent-config.js` host/path patterns |
| Policy packs | Yes | Catalog in `policy-packs.js` |
| Per-customer rules | No | Admin JSON / packs in DB `organizations.settings` |

There is no hidden ML model. “Context-aware” means **field label + intent + suppress/prefer rules**, not trained embeddings.

## Extending safely

1. **New label behavior** — add a row to `SEMANTICS` in `field-semantics.js`.
2. **New pattern** — add detector in `lib-bundle.js`, then add gating/context-resolve if it collides with existing categories.
3. **New enforcement** — add category to `policy/schema.js` and policy packs; detection and policy are separate.

## Tests

`tests/detection/` — PPS, IBAN spacing, name-field SWIFT suppression. Run `npm test`.

## Related

- [POLICY_CONFIG.md](POLICY_CONFIG.md) — packs and admin JSON
- [OPS.md](OPS.md) — platform monitoring and support tab
