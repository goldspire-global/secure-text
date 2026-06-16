# Host the unlock page for email

Email recipients (Hotmail, Outlook, etc.) need an **https://** link. The extension cannot use `chrome-extension://` links in sent mail.

## Quick setup (GitHub Pages)

1. Run `node scripts/package.mjs` — use the **`dist/unlock-deploy/`** folder (self-contained, all scripts included)
2. Create a repo (e.g. `goldspire-unlock`) and upload **everything inside `unlock-deploy/`** to the repo root
3. Enable GitHub Pages → branch `main`, folder `/`
4. Your URL: `https://YOUR_USERNAME.github.io/goldspire-unlock/unlock.html`
5. Paste that URL in extension **Settings → Public unlock page URL**

## What gets sent in email

```html
<a href="https://yoursite.github.io/goldspire-unlock/unlock.html#ENCODED_PAYLOAD">[redacted]</a>
```

Recipients see a clickable **[redacted]** link. The secret is in the link hash (never sent to a server).
