# Outlook add-in (enterprise roadmap)

Native Outlook desktop and mobile apps cannot run Chrome extension content scripts. Today those users tap the **hosted unlock link** in `[redacted]` mail.

## Goal

An **Outlook Add-in** (Office.js) that:

1. Detects `[redacted]` tokens in the reading pane
2. Opens a task pane modal for passphrase entry (same UX as web extension)
3. Replaces `[redacted]` inline after decrypt
4. Uses the same crypto/marker modules (shared bundle)

## Deployment

- IT distributes via **Microsoft 365 Admin Center** → Integrated apps
- Manifest points to hosted `taskpane.html` on org CDN or Goldspire Pages
- SSO optional; passphrase still client-side only

## Scope estimate

| Piece | Effort |
|-------|--------|
| Office.js task pane + shared crypto bundle | Medium |
| Read item body / replace text API quirks | Medium |
| Admin manifest + documentation | Small |
| Store submission (optional public listing) | Medium |

## Interim

Until the add-in ships:

- **Outlook web** + extension → in-page modal ✓
- **Outlook desktop / mobile** → unlock link → `unlock.html` ✓
- Password manager autofill on hosted unlock page ✓

Contact your Goldspire admin to prioritize add-in work for your tenant.
