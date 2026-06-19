# Veil manual test guide

Use this after `npm run package` and loading **`extension/dist`** in the browser.

See also: [docs/README.md](README.md) · [GETTING_STARTED.md](GETTING_STARTED.md) · [MEMBER_GUIDE.md](MEMBER_GUIDE.md) · [ADMIN_GUIDE.md](ADMIN_GUIDE.md) · [MARKET_READY.md](MARKET_READY.md)

### Automated regression (run before manual browser testing)

```bash
npm run test:daily-use   # copilot toggle, paste, type, Allow, Stripe keys
npm test                 # full suite (~122 tests)
```

`test:daily-use` covers behaviours that are painful to catch manually: stale settings after toggling copilot, `sk_live` / `whsec` detection, Allow target insertion, field snooze reset, and paste dedupe.

Intent-aware gating (`tests/scenarios/intent-gating.test.mjs`) covers signup forms staying quiet on email/DOB while typing, secrets still prompting, and admin portals suppressing PII noise.

---

## Before you test (one time per browser)

1. **Load the extension**  
   Edge or Chrome → Extensions → Developer mode → **Load unpacked** → `extension/dist`

2. **Join your team**  
   - Open the Veil popup → **Team** → join code + work email  
   - Or use the portal join page linked from your admin  
   - Confirm popup **Home** checklist is green (connected, passphrase, copilot)

3. **Refresh the mail tab**  
   After joining, reload Outlook or Gmail (F5) so the content script picks up settings.

> **Team users:** Veil copilot is **on by default** after join. Personal users enable it in Settings.

---

## Important: paste vs highlight vs typing

| Action | Copilot appears? |
|--------|------------------|
| **Paste** (Ctrl+V) sensitive text | **Yes** — paste copilot modal |
| **Highlight** text | **Yes** — Veil bar above selection |
| **Type** then pause (~0.5s) in compose | **Yes** — secrets and high-risk data only |
| **Type** on signup / profile forms | **Usually no** — email, name, DOB are expected there |
| **Type** `sk_live_…` anywhere | **Yes** — secrets always prompt |

---

## Test 1a — Smart copilot on signup (no noise)

1. Open any signup or job-application form (or a local HTML form with email + DOB fields)
2. Type your email and date of birth normally — pause briefly after each field

**Expected:** No copilot popup while typing expected PII.

3. In a notes/comments field on the same page, type a Stripe **live** secret key (`sk_live_` plus at least 24 characters — not a real key).
   Pause ~0.5s.

**Expected:** Copilot **does** appear for the API key.

---

## Test 1b — Admin portal stays quiet on contact fields

1. Open a store partner dashboard or admin settings page (e.g. Partner Center listing contact email)
2. Type a support email address and pause

**Expected:** No popup for routine contact email while typing.

3. Paste a Stripe secret key into the same field

**Expected:** Copilot prompts on paste.

---
## Test 1 — Paste copilot (Outlook new mail)

1. Open Outlook on the web → **New mail**
2. Click in the message body
3. Copy this to your clipboard:
   ```
   AIzaSyDaGmWKa4JsXZ-HjGw7ISLn_3namBGewQe
   ```
4. **Ctrl+V** in the body

**Expected:** Modal — *Sensitive data pasted* — with **Encrypt**, **Mask**, **Allow**, and **Tokenize** (cloud org).

---

## Test 2 — Selection copilot

1. In the mail body, paste or type an IBAN, e.g. `DE89370400440532013000`
2. **Highlight** the full IBAN

**Expected:** Veil bar near the selection with Encrypt / Mask / Tokenize.

---

## Test 3 — Classic secure (shortcut)

1. Highlight any secret in the mail body
2. **Ctrl+Shift+S** or right-click → Veil → **Secure selection**

**Expected:** Text becomes `[redacted]`; click to unlock with team passphrase.

---

## Test 4 — Tokenize cross-client

1. Tokenize a secret in **Outlook (Edge)**
2. Send to yourself
3. Open in **Gmail (Chrome)** with Veil installed and same org joined
4. Click `[veil:vt_…]`

**Expected:** Passphrase prompt → plaintext revealed.

---

## Test 5 — DLP enforce (org admin)

1. Admin portal → DLP → **Enforce** → Save
2. Member extension syncs → paste API key again

**Expected:** Block or auto-mask per org policy.

---

## Test 6 — Learning telemetry (day-one capture)

Personal and team users contribute **metadata-only** decision signals (host, category, intent, field type — never matched text).

1. **Personal:** Settings → Help → **Help improve Veil** should be **checked** (default on). Uncheck to opt out.
2. Paste or type a secret, get a copilot prompt, choose **Allow** (override).
3. Repeat on a signup form name field with a false-positive SWIFT-like string if you have one.

**Expected:** No UI change — signals buffer locally and upload in background.

**Ops verification (admin):**

1. Open `/ops.html` → **Learning** tab — confirm **Automation: On** and decision counts
2. Auto-train runs when enough signals arrive; use **Train now (force)** to test immediately
3. Confirm override buckets appear; approve edge-case proposals manually if needed

See [LEARNING_LOOP.md](LEARNING_LOOP.md) for architecture and Railway env vars.

---

## Quick isolation checklist

| Check | How |
|-------|-----|
| Team joined? | Popup Home checklist |
| Copilot enabled? | Settings → Veil copilot (on by default for teams) |
| Tab refreshed? | F5 on Outlook/Gmail |
| Extension from `dist`? | Re-run `npm run package` after code changes |
| Both browsers joined? | Edge and Chrome need separate join |

---

## Sample values

| Type | Example |
|------|---------|
| Google API key | `AIzaSyDaGmWKa4JsXZ-HjGw7ISLn_3namBGewQe` |
| IBAN | `DE89370400440532013000` |
| Credit card | `4111111111111111` |
