# Outlook add-in (v1.4)

Native **Outlook desktop** cannot run Chrome extension content scripts. The Veil Outlook add-in brings in-thread unlock to thick-client Outlook.

## What it does

1. Adds an **Unlock with Veil** button on the message read ribbon
2. Scans the open message for `[redacted]` markers
3. Decrypts locally in the task pane after passphrase entry
4. Replaces secured text inline in the message body

Plaintext never leaves the device. Same AES-GCM + PBKDF2 stack as the browser extension.

## Files

| File | Purpose |
|------|---------|
| `manifest.xml` | Office add-in manifest for M365 Admin Center |
| `taskpane.html` | Task pane UI |
| `taskpane.js` | Office.js body read + decrypt |
| `taskpane.css` | Pane styling |

Hosted at `https://veil.goldspireventures.com/outlook-addin/` after portal deploy.

## IT deployment

1. Open **Microsoft 365 Admin Center** → **Settings** → **Integrated apps**
2. **Upload custom apps** → provide `manifest.xml`
3. Assign to users or groups who use Outlook desktop
4. Users open a message with `[redacted]` → **Unlock with Veil**

## Requirements

- Outlook on Windows/Mac (Microsoft 365)
- Mailbox 1.5+ API set
- Recipients still need the passphrase from the sender

## Compose / send

Outlook desktop **compose** still requires the Veil browser extension (Outlook on the web) or manual secure flow. This add-in targets **read/unlock** — the largest desktop gap.

## Interim (no add-in)

- **Outlook web** + extension → full copilot ✓
- **Desktop/mobile read** → hosted `unlock.html` link ✓
