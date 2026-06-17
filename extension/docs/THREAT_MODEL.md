# Threat model (v1)

This document summarizes how **Goldspire Secure Text** protects secrets, what the server can/can’t see, and what assumptions security reviewers should validate.

## Goals

- Protect secrets typed into email / web apps from accidental exposure in tickets, chats, emails, screenshots, and forwards.
- Ensure the **server cannot decrypt user secrets**.
- Allow organizations to deliver unlock capability to specific recipients (**org inbox**) without sending plaintext to the server.

## Non-goals

- Defend against a fully compromised endpoint (malware / keylogger / hostile browser profile).
- Provide message integrity for arbitrary edited text once it leaves the editor (email clients may mutate HTML).
- Replace DLP / CASB controls; this is a client-side encryption UX layer.

## Data flow summary

### Secure (team/personal)

1. User highlights text.
2. Extension derives a key from the passphrase (PBKDF2) and encrypts plaintext (AES‑GCM).
3. The email/page receives a `[redacted]` marker containing ciphertext.
4. Plaintext is not sent to any server.

### Unlock

1. Recipient clicks `[redacted]`.
2. Extension decrypts locally using passphrase (or org inbox key for direct shares).
3. Plaintext is written inline in the page editor.

## What the server can see

When using the optional org API (`api/` in this repo):

- **Join code** and device id during join.
- **Public key material** for members (for org inbox delivery).
- **Wrapped unlock keys** (ciphertext), never plaintext.
- Metadata: timestamps, org id, device id.

The server **does not** receive:

- Team passphrase in normal operation (except demo seed/dev).
- Any plaintext secrets from secured text.
- Decrypted content during unlock.

## No “hardcoding” / backdoors

- There is **no built-in unlock key** or universal passphrase.
- Demo values (join codes, demo passphrase) live only in **seed scripts** for local development.
- Production deployments should not ship seed data.

## Key risks + mitigations

### 1) Malicious webpage attempting to call the org API

- Mitigation: API CORS is **allow-listed** (`CORS_ALLOW_ORIGINS`), not `*`.
- Mitigation: Bearer tokens are validated server-side and tied to device/org.

### 2) Token theft from compromised browser profile

- If an attacker can read extension storage, they may impersonate a device.
- This is out of scope for endpoint-compromise; mitigate with enterprise controls (MDM, OS hardening, least privilege, browser profile policies).

### 3) Email client mutation

- Some clients modify HTML/copy/paste. The extension uses robust markers and hashes payload-only for share lookups.

### 4) Abuse of “keep unlocked” time window

- Mitigation: org profile enforces a **hard max relock delay** in UI.

## Recommended enterprise checks

- Independent review of:
  - `extension/src/crypto.js`
  - `extension/src/secrets.js`
  - `api/src/auth.mjs`, `api/src/org-service.mjs`, `api/src/share-service.mjs`
- Verify server logs do not include secrets.
- Distribute signed builds (Chrome Web Store or enterprise policy).

# Threat model — Goldspire Secure Text

This document explains what the extension **does** and **does not** protect against. Share it with your team before rolling out.

## Assets

1. **Plaintext secrets** — passwords, API keys, account numbers in email/chat
2. **Team passphrase** — shared key that decrypts all team-protected messages
3. **One-time codes** — per-message keys for single-recipient sharing

## Trust boundaries

```text
┌─────────────────────────────────────────────────────────┐
│  Sender browser (extension)                              │
│  Plaintext → encrypt → [redacted] in compose field       │
└──────────────────────────┬──────────────────────────────┘
                           │ email / chat (ciphertext public)
                           ▼
┌─────────────────────────────────────────────────────────┐
│  Receiver browser (extension OR hosted unlock page)      │
│  Passphrase + ciphertext → plaintext in page           │
└─────────────────────────────────────────────────────────┘
```

Encryption and decryption never leave the user's browser.

## In scope — we mitigate

| Threat | Mitigation |
|--------|------------|
| Passive network attacker | No server round-trip; TLS for hosted page only |
| Casual shoulder-surfing in inbox | `[redacted]` hides plaintext until unlock |
| Weak team passwords (new installs) | 16+ char policy; local storage or external vault |
| Passphrase theft from sync storage | AES-GCM wrap with per-device key |
| Org passphrase in session storage | Encrypted at rest (v0.7+) |
| Brute-force on unlock UI | Rate limit per marker (extension + unlock page) |
| One-time link reuse on same device | Burn-after-read local registry |
| Stale one-time messages | 72-hour envelope expiry |
| Clipboard linger | Auto-clear after configurable seconds |

## Out of scope — we do **not** fully mitigate

| Threat | Reality |
|--------|---------|
| Anyone with team passphrase | Can decrypt **all** team messages (by design) |
| Ciphertext in email is public | Forwarded mail, backups, legal hold — all retain ciphertext |
| Metadata leakage | Subject, recipients, timing, message length still visible |
| Compromised sender/receiver device | Malware, screen capture, keyloggers bypass client crypto |
| Burn-after-read across devices | Without a server, first unlock on device A does not burn on device B |
| Nation-state / APT | Not targeted; no HSM, no hardware-backed keys |
| Malicious extension updates | Use pinned enterprise distribution or store review |
| Gmail/Outlook HTML sanitization changes | `[redacted]` links may degrade in some clients |

## Adversary personas

### Curious colleague

Can forward `[redacted]` mail. Needs passphrase to read. **Mitigated** if passphrase is strong and only in a shared team vault.

### IT admin with mailbox access

Sees ciphertext in archive. Cannot decrypt without passphrase. **Mitigated** for content; not for metadata.

### Attacker with inbox + weak passphrase

Dictionary attack offline against captured ciphertext. **Partially mitigated** by PBKDF2 600k — use 20+ random characters from your password manager.

### Attacker with unlocked browser session

Reads plaintext after legitimate unlock. **Not mitigated** — use re-lock timer and lock workstation.

## Recommended operating procedures

1. **One shared vault item** — e.g. `Goldspire Team Passphrase`, 20+ random characters
2. Choose **external vault** or **store locally** per your security policy
3. Use **Organization** security profile for stricter defaults
4. Prefer **one-time mode** for external recipients or single-use secrets
5. Do not put one-time codes in the same message as `[redacted]`
6. Train users: extension does not stop screenshots or forward-after-unlock

## Enterprise additions (roadmap)

| Capability | Status |
|------------|--------|
| Outlook add-in (in-app modal) | Planned — see [OUTLOOK_ADDIN.md](OUTLOOK_ADDIN.md) |
| Admin key distribution via MDM / vault | Operational (manual or policy today) |
| Central audit / SIEM | Local metadata only today |
| Argon2id wire format v3 | Under evaluation |
| Third-party crypto audit | Recommended before wide rollout |

## Compliance note

This is **not** end-to-end encrypted email. It is **field-level encryption** embedded in message bodies. Legal/compliance teams should treat it as reducing accidental disclosure, not as a certified data-protection control without further process and review.
