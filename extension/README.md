# Goldspire Secure Text

Highlight sensitive text → **`[redacted]`** → send. Recipients click to unlock on the same page.

## Install

**Chrome / Edge:** `chrome://extensions` or `edge://extensions` → Developer mode → Load unpacked → select this folder.

**Firefox:** `about:debugging` → Load Temporary Add-on → `manifest.json`.

Reload the extension after updates.

## Sender

1. Highlight secret text (Jira, Gmail, anywhere)
2. `Ctrl+Shift+S` or right-click → **Goldspire Secure Text → Secure selection**
3. Text becomes `[redacted]` — send as normal

With a provisioned team passphrase (IT policy or cloud join), securing is **one click** (no dialog).

## Organization

**Enterprise:** IT deploys managed policy — users skip setup, passphrase pushes automatically. [docs/ENTERPRISE.md](docs/ENTERPRISE.md)

**Self-serve teams:** Join code or SSO in the extension — policy syncs from cloud. [docs/ORG_PROVISIONING.md](docs/ORG_PROVISIONING.md)

## Receiver

**With extension:** Click `[redacted]` → enter passphrase → secret appears inline → auto re-locks.

**Without extension:** Drag **Unlock [redacted]** bookmarklet (extension popup → Tools tab) to your bookmarks bar. On the message page, click the bookmarklet, then click `[redacted]`.

## What it looks like

```text
testing my [redacted] pswd extension
```

The encrypted data is invisible — not a footer, not a URL in the sentence.

## Shortcuts

| Key | Action |
|-----|--------|
| `Ctrl+Shift+S` | Secure as [redacted] |
| `Ctrl+Shift+U` | Unlock |
| `Ctrl+Shift+G` | Generate password |

## Security (v0.7)

- **AES-256-GCM** + PBKDF2-SHA256 (600k iterations), all in the browser
- **Strong passphrase policy** — 16+ chars for organization profile; store locally or external vault
- **Encrypted passphrase storage** — personal (sync) and organization (session)
- **One-time mode** — 72h expiry, burn-after-read per device, rate-limited unlock
- **Hosted unlock page** — CSP + Subresource Integrity on deploy bundle
- **Local audit log** — metadata only (action, host, mode) — no secrets

Read [SECURITY.md](SECURITY.md) and [docs/THREAT_MODEL.md](docs/THREAT_MODEL.md) before team rollout.

**Enterprise (GPO / Intune):** [docs/ENTERPRISE.md](docs/ENTERPRISE.md) — push `teamPassphrase` via managed policy for zero-prompt one-click secure.

**Team passphrase options:** [docs/TEAM_VAULT.md](docs/TEAM_VAULT.md) — external vault vs provisioned policy.

**Organization provisioning:** [docs/ORG_PROVISIONING.md](docs/ORG_PROVISIONING.md) — MDM vs cloud join.

**Cloud API (this repo):** `api/` on port **3015** — run `npm run setup:cloud && npm run api:dev` from the repo root after configuring Supabase in `.env`.

## Package & deploy unlock site

```bash
node scripts/package.mjs
```

- Extension: `dist/`
- GitHub Pages unlock bundle: `dist/unlock-deploy/` → push to [goldspire-global/secure-text](https://github.com/goldspire-global/secure-text)
