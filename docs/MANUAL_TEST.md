# Veil manual test guide

Use this after `npm run package` and loading **`extension/dist`** in the browser.

---

## Before you test (one time per browser)

1. **Load the extension**  
   Edge → Extensions → Developer mode → **Load unpacked** → `extension/dist`

2. **Join your team (Alice)**  
   - Open the Veil popup → complete org setup with join code + `alice@novacare.demo` (or your org email)  
   - Confirm popup shows your team name and **Connected**

3. **Enable Veil copilot** (required for paste/selection prompts)  
   - Popup → **Advanced** (expand)  
   - Expand **Veil security copilot (preview)**  
   - Check **Enable Veil copilot**  
   - Click **Save** at the bottom of the form  

4. **Refresh the mail tab**  
   After saving settings, reload Outlook (F5) so the content script picks up copilot.

> **Copilot is off by default.** Without step 3, typing or pasting secrets will not show Encrypt / Mask / Allow.

---

## Important: typing vs paste vs highlight

| Action | Copilot appears? |
|--------|------------------|
| **Type** secrets character-by-character | **No** — not wired yet |
| **Paste** (Ctrl+V) sensitive text | **Yes** — paste copilot modal |
| **Highlight** text you typed or pasted | **Yes** — Veil bar above selection |

So in Outlook: **paste** the API key, or **type it then select/highlight it**.

---

## Test 1 — Paste copilot (Outlook new mail)

1. Open Outlook on the web → **New mail**
2. Click in the message body
3. Copy this to your clipboard (do not type it):
   ```
   AIzaSyDaGmWKa4JsXZ-HjGw7ISLn_3namBGewQe
   ```
4. **Ctrl+V** in the body

**Expected:** Modal — *Sensitive data pasted* — with **Encrypt**, **Mask**, **Allow** (and Tokenize if cloud org joined).

**If nothing:** Copilot not enabled (step 3), tab not refreshed, or site snoozed (popup → clear snoozed sites).

---

## Test 2 — Selection copilot (after typing)

1. In the mail body, **type** (or paste) an IBAN, e.g.:
   ```
   DE89370400440532013000
   ```
2. **Mouse-select / highlight** the full IBAN (drag over the text)

**Expected:** Veil bar near the selection — categories shown, buttons **Encrypt**, **Mask**, etc.

**If nothing:** Copilot off, text not selected (cursor alone is not enough), or not detected as compose field.

---

## Test 3 — Classic Secure Text (no copilot required)

Works even with copilot **off**:

1. Highlight any secret in the mail body
2. **Ctrl+Shift+S** or right-click → Veil → **Secure selection**

**Expected:** Text becomes `[redacted]`; click to unlock with team passphrase.

---

## Test 4 — DLP enforce (optional, org admin)

1. Popup → DLP mode → **Enforce** → Save → refresh tab  
2. Paste an API key again  

**Expected:** Block or auto-mask per org policy (may block paste without modal if policy says block).

---

## Test 5 — Secure token (cloud org)

1. Copilot on, joined to cloud org, team passphrase saved  
2. Highlight API key → Veil bar → **Tokenize**  

**Expected:** Selection becomes `[veil:vt_…]`; click chip to reveal.

---

## Quick isolation checklist

If Outlook fails, try **Gmail compose** with the same paste test. If Gmail works but Outlook does not, it is an Outlook/iframe issue — report host + browser.

| Check | How |
|-------|-----|
| Copilot enabled? | Popup → Advanced → Enable Veil copilot → **Save** |
| Tab refreshed after save? | F5 on Outlook |
| Using paste or highlight? | Typing alone does not trigger copilot |
| Extension loaded from `dist`? | Re-run `npm run package` after code changes |
| Snoozed site? | Popup → clear snoozed hosts |

---

## Sample values

| Type | Example |
|------|---------|
| Google API key | `AIzaSyDaGmWKa4JsXZ-HjGw7ISLn_3namBGewQe` |
| IBAN (compact) | `DE89370400440532013000` |
| IBAN (spaced) | `DE89 3704 0044 0532 0130 00` |
| Credit card | `4111111111111111` |
| JWT | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U` |
