# Documentation screenshots

Visual assets for customer guides (`MEMBER_GUIDE.md`, `PERSONAL_GUIDE.md`, etc.).

## File naming

| File | Used in | Shows |
|------|---------|--------|
| `popup-home-checklist.png` | Member, Personal guides | Extension popup — setup checklist |
| `copilot-paste-modal.png` | Member, Personal guides | Copilot when pasting a secret |
| `email-redacted-unlock.png` | Member guide | `[redacted]` in email — click to unlock |
| `email-veil-token.png` | Member guide | `[veil:vt_…]` token in email |

## Capture workflow

Screenshots are generated from the extension demo pages (1280×800) — same pipeline as the Chrome/Edge store listing.

```bash
npx playwright install chromium   # once
npm run capture:store             # writes extension/store/screenshots/
npm run docs:screenshots          # copies into docs/screenshots/
```

Commit the PNGs in `docs/screenshots/` so GitHub and the portal can serve them without Playwright.

## Adding a new screenshot

1. Add a demo page under `extension/store/demo/` if needed.
2. Register it in `scripts/capture-store-screenshots.mjs`.
3. Map the output name in `scripts/sync-doc-screenshots.mjs`.
4. Reference in markdown: `![Alt text](screenshots/your-file.png)` (paths relative to `docs/`).

Keep alt text descriptive for accessibility. Do not include real secrets or customer data in captures — demo fixtures only.
