# Veil competitive landscape

Last reviewed: June 2026. Re-check before store listing or investor conversations.

## Short answer

**No extension we found combines all of Veil’s core behaviors in one product:**

1. Inline `[redacted]` / team tokens in **email compose and read** (Outlook web, Gmail)
2. **Click-to-unlock on the same page** for recipients (client-side AES-GCM)
3. **Org cloud** for membership, tokens, and security events — without server-side plaintext
4. **Browser-native copilot** on paste, highlight, and selection across mail + web + AI chat
5. **IT-managed** rollout (policy push, team passphrase, skip onboarding)
6. **Keyboard-edge category** — protect before data hits mail/AI pipelines, not after

Closest overlaps each cover **one slice** of that stack.

## Category map

| Category | Examples | What they do well | Gap vs Veil |
|----------|----------|-------------------|-------------|
| **AI paste guard** | PasteGuard, PasteSecure, SafePaste Enterprise, Magier | Intercept paste into ChatGPT/Claude; mask or block secrets | Not built for Outlook/Gmail inline send; no team token workflow |
| **Generic encrypt-in-browser** | Locki | Right-click encrypt in any web app; Teams admin | Manual selection; no `[redacted]` send-as-normal; no org token sync |
| **Email encryption (PGP)** | Mailvelope, FlowCrypt | End-to-end email crypto for partners with keys | Heavy UX; not inline redaction; recipients need crypto setup |
| **Enterprise DLP (SaaS)** | Strac, Nightfall, native Google/M365 DLP | Server-side scan, block, quarantine, audit | Data leaves device to policy engine; not keyboard-edge copilot UX |
| **Browser DLP (enterprise)** | Microsoft Purview inline in Edge | Policy in managed Edge | Microsoft stack; not cross-browser extension + Goldspire portal |
| **MCP / AI gateway** | Strac MCP DLP | Redact tool calls to Gmail/AI agents | Infrastructure play, not employee-facing mail copilot |

## Closest competitors (detail)

### Locki ([lockisecurity.com](https://lockisecurity.com/en))

- Browser extension; encrypt via context menu in Gmail, Slack, etc.
- Regex DLP “before it reaches” apps.
- **Diff:** User must actively encrypt; no `[redacted]` placeholder that reads naturally in sent mail; no `[veil:vt_…]` cross-client tokens; no Outlook compose pill / highlight flow.

### Paste-focused AI DLP (Chrome Web Store category)

- Products marketed for **LLM paste** surfaces.
- **Diff:** Veil’s copilot also guards **email composition** and supports **tokenize + team reveal** — the “send as normal, unlock later” email story is unique in this set.

### Strac / similar cloud DLP

- OAuth into Workspace; scans mail in flight; redact/block/quarantine.
- **Diff:** Veil encrypts **before** content hits the mail pipeline; plaintext never required on a vendor server. Trade-off: Veil is user-empowering copilot, not full enterprise DLP replacement (yet).

### Microsoft Purview (Edge)

- Inline DLP in managed Edge for M365.
- **Diff:** Veil works Chrome + Edge + personal mode; lighter IT; Goldspire portal; passphrase + token model not tied to sensitivity labels.

## Veil differentiators (positioning)

Use this language consistently:

1. **Keyboard-edge protection** — proactive at the keyboard, not reactive server scan.
2. **Browser Security Copilot** — paste, highlight, and typing surfaces; shows redacted match preview before action.
3. **Send as normal** — `[redacted]` and `[veil:vt_…]` look like normal mail; recipients click to unlock in-thread.
4. **Client-side only** — encryption in Web Crypto; cloud stores ciphertext and metadata.
5. **Email-native** — Outlook web pill, Gmail split-HTML tokens, cross-pane re-lock.
6. **Team without friction** — join code portal, managed policy, copilot on by default for orgs.
7. **AI surfaces** — Sanitize on ChatGPT, Claude, Gemini, Copilot, Perplexity before secrets reach models.

## Shipped capabilities (June 2026)

| Capability | Status |
|------------|--------|
| Recipient unlock link (no extension) | **Shipped** — hosted `unlock.html`, zero-knowledge |
| Typing / paste copilot | **Shipped** — debounced detect on compose + AI sites |
| Policy packs | **Shipped** — finance, healthcare, eng presets in portal |
| SIEM webhook | **Shipped** — metadata-only security events |
| 1Password / Bitwarden org passphrase | **Partial** — vault-sourced team passphrase via managed policy |
| “Explain why” with redacted preview | **Shipped** — copilot WHY lines show sk-…x4K9 style preview |
| Regional ID wave 2 (BSN, CPF, HKID, etc.) | **Shipped** v1.3.4+ |
| API keys, PEM, connection strings | **Shipped** v1.3.4+ |
| Practice sandbox + first-secure flow | **Shipped** v1.4.0 — `practice.html` + popup CTA |
| Weekly protection hero stats | **Shipped** v1.4.0 |
| Security proof panel (popup) | **Shipped** v1.4.0 |

## Stand-out opportunities (next)

| Idea | Why it matters |
|------|----------------|
| **Outlook desktop add-in** | Native compose in thick-client Outlook — largest enterprise gap |
| **Post-send attestation** | Cryptographic proof envelope was encrypted client-side |
| **Learning dashboard for admins** | When-to-prompt telemetry surfaced in team console |
| **Deep vault integrations** | One-click passphrase from 1Password/Bitwarden in popup |
| **Mobile companion** | Read/unlock on phone for `[redacted]` in mobile mail |

## Verification note

Competitive set changes quickly. Before claiming “only” in marketing:

1. Search Chrome Web Store: `DLP`, `paste guard`, `encrypt gmail`, `data loss prevention`.
2. Check [Locki](https://lockisecurity.com/en), [Strac Gmail DLP](https://www.strac.io/integration/gmail-dlp).
3. Soft claim: *“The only keyboard-edge copilot built for inline email redaction, team tokens, and client-side unlock.”*
