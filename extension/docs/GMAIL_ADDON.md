# Gmail add-on (v1.4)

Native **Gmail app** and **Gmail mobile** cannot run Chrome extension content scripts. The Veil Gmail add-on brings read-pane unlock to thick-client Gmail — same role as the Outlook add-in.

## What it does

1. Appears when you open a message in Gmail (web sidebar or mobile card)
2. Scans the message for `[redacted]` markers
3. Opens a Veil unlock panel for passphrase entry
4. Decrypts locally — plaintext never uploads to Goldspire

Same AES-GCM + PBKDF2 stack as the browser extension and Outlook add-in.

## Files

| Path | Purpose |
|------|---------|
| `gmail-addon/taskpane.html` | Hosted unlock UI (testing + fallback) |
| `gmail-addon/taskpane.js` | Hosted pane bootstrap |
| `gmail-addon/apps-script/` | Google Workspace add-on (clasp deploy) |
| `mail-addin/unlock-pane.js` | Shared unlock logic (Outlook + Gmail) |

Hosted at `https://veil.goldspireventures.com/gmail-addon/` after portal deploy.

## IT deployment

1. Create a Google Cloud project and enable the Gmail API
2. Copy `.clasp.json.example` to `.clasp.json` and set your Apps Script project ID
3. From `gmail-addon/apps-script/`: `clasp login` then `clasp push`
4. Deploy `doGet` as a **web app** (execute as: user accessing, anyone with Google account)
5. Set script property `VEIL_GMAIL_WEB_APP_URL` to the web app URL (Script properties → Project settings)
6. Publish the add-on in **Google Workspace Marketplace** or install for your domain in Admin Console

Users open a message with `[redacted]` → **Unlock with Veil** in the add-on card.

## Compose / send

Gmail **compose** still requires the Veil browser extension on `mail.google.com` or the hosted unlock link for recipients without Veil.

## Parity with Outlook add-in

| | Outlook add-in | Gmail add-on |
|--|----------------|--------------|
| Read/unlock | ✓ | ✓ |
| Inline body replace | ✓ (Office.js) | Show in panel* |
| Compose/copilot | Extension only | Extension only |
| IT deploy | M365 Admin manifest | Workspace Marketplace / clasp |

\*Gmail does not allow arbitrary in-body HTML replacement from add-ons; unlocked text is shown in the panel (same as hosted fallback).

## Interim (no add-on)

- **Gmail web** + extension → full copilot ✓
- **Gmail app / mobile read** → hosted `unlock.html` link ✓
