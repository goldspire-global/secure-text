# Veil competitive landscape & product roadmap

Last reviewed: June 2026. Re-check before store listing or investor conversations.

## Executive summary

Veil competes at the **keyboard edge** — where employees type, paste, and send — not in the mail server or SIEM. Big DLP vendors (Microsoft Purview, Strac, Nightfall) win on **policy breadth, quarantine, and compliance workflows**. Veil wins on **frictionless UX**, **client-side encryption**, and **email-native redaction** that reads like normal mail.

To be a **major competitor**, Veil must own three layers:

| Layer | What it means | Status (v1.5) |
|-------|---------------|-----------------|
| **Identity** | One user across Chrome, Edge, devices | Shipped — multi-device tables, same email = same seat |
| **Continuity** | Passphrase, prefs, copilot memory follow the user | Shipped — profile sync API + extension pull/push |
| **Control plane** | IT sees risk, policies, rollout, audit | Partial — portal, SIEM webhook, policy packs; learning dashboard missing |

Missing any layer feels broken to users (identity without continuity = “why did my passphrase disappear on Edge?”).

---

## What no one else combines (today)

**No extension we found ships all of this in one product:**

1. Inline `[redacted]` / team tokens in **email compose and read** (Outlook web, Gmail)
2. **Click-to-unlock on the same page** for recipients (client-side AES-GCM)
3. **Org cloud** for membership, tokens, and security events — without server-side plaintext
4. **Browser-native copilot** on paste, highlight, and selection across mail + web + AI chat
5. **IT-managed** rollout (policy push, team passphrase, skip onboarding)
6. **Cross-browser continuity** — same account on Chrome + Edge with synced passphrase and copilot memory
7. **Keyboard-edge category** — protect before data hits mail/AI pipelines, not after

Closest overlaps each cover **one slice** of that stack.

---

## Category map

| Category | Examples | What they do well | Gap vs Veil |
|----------|----------|-------------------|-------------|
| **AI paste guard** | PasteGuard, PasteSecure, SafePaste Enterprise, Magier | Intercept paste into ChatGPT/Claude; mask or block secrets | Not built for Outlook/Gmail inline send; no team token workflow; no cross-browser profile |
| **Generic encrypt-in-browser** | Locki | Right-click encrypt in any web app; Teams admin | Manual selection; no `[redacted]` send-as-normal; no org token sync |
| **Email encryption (PGP)** | Mailvelope, FlowCrypt | End-to-end email crypto for partners with keys | Heavy UX; not inline redaction; recipients need crypto setup |
| **Enterprise DLP (SaaS)** | Strac, Nightfall, native Google/M365 DLP | Server-side scan, block, quarantine, audit | Data leaves device to policy engine; not keyboard-edge copilot UX |
| **Browser DLP (enterprise)** | Microsoft Purview inline in Edge | Policy in managed Edge | Microsoft stack; not cross-browser extension + Goldspire portal |
| **MCP / AI gateway** | Strac MCP DLP | Redact tool calls to Gmail/AI agents | Infrastructure play, not employee-facing mail copilot |

---

## Closest competitors (detail)

### Locki ([lockisecurity.com](https://lockisecurity.com/en))

- Browser extension; encrypt via context menu in Gmail, Slack, etc.
- Regex DLP “before it reaches” apps.
- **Diff:** User must actively encrypt; no `[redacted]` placeholder that reads naturally in sent mail; no `[veil:vt_…]` cross-client tokens; no Outlook compose pill / highlight flow; no cloud profile continuity.

### Paste-focused AI DLP (Chrome Web Store category)

- Products marketed for **LLM paste** surfaces.
- **Diff:** Veil’s copilot also guards **email composition** and supports **tokenize + team reveal** — the “send as normal, unlock later” email story is unique in this set.

### Strac / Nightfall / cloud DLP

- OAuth into Workspace; scans mail in flight; redact/block/quarantine.
- **Diff:** Veil encrypts **before** content hits the mail pipeline; plaintext never required on a vendor server.
- **Their advantage:** Quarantine workflows, legal hold, full mail archive scan, CASB breadth.
- **Veil path:** Partner or webhook into their stack for “keyboard-edge + server-side” hybrid — don’t try to replicate quarantine in v1.

### Microsoft Purview (Edge + M365)

- Inline DLP in managed Edge for M365; sensitivity labels; admin console at scale.
- **Diff:** Veil works Chrome + Edge + personal mode; lighter IT; Goldspire portal; passphrase + token model not tied to sensitivity labels.
- **Their advantage:** Native Outlook desktop, Teams, SharePoint, Entra ID, eDiscovery.
- **Veil path:** Outlook/Gmail add-ins (started), SCIM, SIEM — meet IT where they are without requiring full M365 lock-in.

---

## Veil differentiators (positioning language)

Use consistently in store, sales, and docs:

1. **Keyboard-edge protection** — proactive at the keyboard, not reactive server scan.
2. **Browser Security Copilot** — paste, highlight, and typing surfaces; shows redacted match preview before action.
3. **Send as normal** — `[redacted]` and `[veil:vt_…]` look like normal mail; recipients click to unlock in-thread.
4. **Client-side only** — encryption in Web Crypto; cloud stores ciphertext and metadata.
5. **Email-native** — Outlook web pill, Gmail split-HTML tokens, cross-pane re-lock.
6. **Team without friction** — join code portal, managed policy, copilot on by default for orgs.
7. **AI surfaces** — Sanitize on ChatGPT, Claude, Gemini, Copilot, Perplexity before secrets reach models.
8. **Continuity across browsers** — one account on Chrome + Edge; passphrase, prefs, site allows, and snoozes sync.

Soft claim: *“The only keyboard-edge copilot built for inline email redaction, team tokens, client-side unlock, and cross-browser continuity.”*

---

## Shipped capabilities (June 2026 / v1.5)

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
| Practice sandbox + first-secure flow | **Shipped** v1.4.0 |
| Weekly protection hero stats | **Shipped** v1.4.0 |
| Security proof panel (popup) | **Shipped** v1.4.0 |
| Multi-device identity (same email ≠ two users) | **Shipped** v1.5.0 — migrations 020 |
| Cloud profile sync (prefs + personal passphrase) | **Shipped** v1.5.0 — migration 021 |
| Copilot memory sync (site allows + host snoozes) | **Shipped** v1.5.0 |
| Welcome “Already use Veil?” link-browser flow | **Shipped** v1.5.0 |
| Personal free email anchor (sync without Plus) | **Shipped** v1.5.0 — optional email at setup |

---

## Roadmap — what makes Veil a *major* competitor

Prioritized by **user pain × differentiation × feasibility** given the current codebase.

### P0 — Table stakes for enterprise evals (next 1–2 quarters)

| Feature | Why it matters | vs big players |
|---------|----------------|----------------|
| **Outlook desktop add-in (compose + read)** | Thick-client Outlook is still ~50% of enterprise mail | Purview native; Locki weak here |
| **Admin learning dashboard** | “Show me where copilot blocked/skipped and why” — closes the loop for security teams | Nightfall/Strac have analytics; we have telemetry but no UI |
| **Policy simulation mode** | Admin previews what copilot would do before enforce | Standard in Purview |
| **SCIM group → policy pack mapping** | Auto-assign finance pack to Finance OU | Expected in any team SKU |
| **Device revoke + session kill** | Lost laptop — admin disconnects browser from portal | We have disconnect; need clearer UX + audit event |

### P1 — Differentiation moat (6–12 months)

| Feature | Why it matters | vs big players |
|---------|----------------|----------------|
| **Post-send attestation** | Cryptographic proof envelope was encrypted client-side before SMTP | Unique; compliance teams love provable client-side |
| **Deep vault integrations** | One-click team passphrase from 1Password/Bitwarden in popup | Reduces IT helpdesk “what’s the team passphrase?” |
| **Mobile unlock companion** | Read/unlock `[redacted]` in mobile mail apps | PGP never solved this well; hosted unlock helps but native app is better |
| **Gmail/Outlook add-in parity** | Same unlock UX on mobile sidebar add-ons | Extends keyboard-edge story off desktop browser |
| **Copilot category packs (custom)** | Customer-defined regex + ML hints in portal | Strac custom classifiers; we stay lighter |
| **Direct-share key multi-device** | Today last device wins; should be per-device wraps like passphrase | Continuity gap for Plus senders |

### P2 — Platform & partner plays (12+ months)

| Feature | Why it matters | vs big players |
|---------|----------------|----------------|
| **MCP / agent gateway** | Redact before LLM tool calls (Gmail send, Jira create) | Strac MCP DLP — partner or build thin gateway |
| **CASB-lite via browser** | Upload/download intercept for S3, Drive, Dropbox | Full CASB is crowded; keyboard-edge upload guard is niche |
| **Compliance exports** | SOC2-friendly audit bundle from portal | Table stakes for $50k+ deals |
| **FedRAMP / EU data residency** | Required for some regulated buyers | Purview wins regulated public sector today |
| **Slack / Teams message guard** | Extend copilot to chat compose | Locki touches Slack; we could own “redacted thread” |

---

## Honest gaps (don’t oversell)

| Gap | Reality | Mitigation |
|-----|---------|------------|
| **Server-side quarantine** | We don’t hold mail; can’t pull back sent messages | Position as prevention; SIEM + webhook for detection |
| **Full mail archive scan** | Not our architecture | Integrate with Strac/Nightfall for retroactive |
| **Sensitivity labels** | M365-native labels don’t apply to Veil tokens | Map policy packs to label intent in docs |
| **Free personal without email** | Still per-browser only until user adds sync email | Onboarding nudge; “Restore personal account” path |
| **Firefox / Safari** | Chromium-first | Firefox ID required; Safari Web Extension later |
| **Offline / air-gapped** | Cloud join requires network | Managed policy + offline passphrase for gov |

---

## Continuity architecture (product mental model)

When building or reviewing features, ask: **does this follow the user across browsers?**

```
Identity (email, org seat, Plus)
    ↓
Secrets (team passphrase via join; personal via encrypted cloud blob + per-device wrap)
    ↓
Preferences (copilot on/off, UI mode, clipboard, password gen)
    ↓
Behavior memory (site allow rules, host snoozes)
    ↓
Ephemeral session (composition allows, category snoozes — session-only, OK to stay local)
```

Anything in the top four layers that stays local-only is a **product bug** for cross-browser users.

---

## Verification note

Competitive set changes quickly. Before claiming “only” in marketing:

1. Search Chrome Web Store: `DLP`, `paste guard`, `encrypt gmail`, `data loss prevention`.
2. Check [Locki](https://lockisecurity.com/en), [Strac Gmail DLP](https://www.strac.io/integration/gmail-dlp).
3. Re-read this doc quarterly and move shipped items from roadmap → shipped table.
