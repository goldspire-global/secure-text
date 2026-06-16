# Security policy

Goldspire Secure Text protects inline secrets in email and web apps using **client-side AES-256-GCM**. No ciphertext or passphrases are sent to Goldspire servers.

## Reporting vulnerabilities

Email **security@goldspire.studio** (or your org contact) with:

- Extension version and browser
- Steps to reproduce
- Impact assessment

Please do not open public issues for undisclosed vulnerabilities.

## Cryptography (v0.7+)

| Component | Choice |
|-----------|--------|
| Symmetric cipher | AES-256-GCM |
| Key derivation | PBKDF2-HMAC-SHA256, 600k iterations |
| Salt / IV | 16 B random salt, 12 B random IV per message |
| AAD | Mode-bound (`gs\|v2\|team` etc.) |

**Future:** Argon2id is under evaluation for a v3 wire format. PBKDF2 at 600k meets current OWASP guidance for SHA-256 in browser extensions without WASM dependencies.

## Passphrase policy

- **Organization profile:** minimum 16 characters, charset diversity encouraged
- **Personal profile:** minimum 12 characters
- **Default (team):** passphrase stored **locally on device** (encrypted) or entered from an **external password vault** once per session
- **One-time codes:** 16-character random codes; 72-hour expiry; burn-after-read per browser

## Data at rest

| Storage | Contents |
|---------|----------|
| `chrome.storage.sync` | Settings; personal passphrase **encrypted** with per-device AES-GCM key |
| `chrome.storage.session` | Organization passphrase **encrypted** with same device key |
| `chrome.storage.local` | Device wrap key; metadata-only audit log (no secrets) |
| Hosted unlock page | Burn list hashes in `localStorage` (one-time messages only) |

## Hosted unlock page

- Content-Security-Policy restricts scripts to same origin
- Deploy bundle (`dist/unlock-deploy/`) includes **Subresource Integrity** hashes on all scripts
- No network calls during unlock

## Permissions rationale

`<all_urls>` is required so `[redacted]` links work in Gmail, Outlook web, Jira, and arbitrary compose surfaces. The extension does not exfiltrate page content.

## Third-party review

Before enterprise rollout we recommend:

1. Independent review of `src/crypto.js`, `src/marker.js`, `src/secrets.js`
2. Penetration test of unlock page + extension messaging surface
3. Signed builds distributed via Chrome Web Store or managed enterprise policy

See [docs/THREAT_MODEL.md](docs/THREAT_MODEL.md) for adversary assumptions and known limits.
