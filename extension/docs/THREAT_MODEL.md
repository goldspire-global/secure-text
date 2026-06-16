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
