# Veil 1.5.0 — Chrome Web Store update

**Upload:** `extension/store/veil-1.5.0.zip` (run `npm run package:store`)  
**Replaces:** 1.3.1 (live)  
**Privacy policy:** https://veil.goldspireventures.com/privacy.html

---

## What's new (paste into store dashboard)

**Short (recommended for Chrome “What’s new”):**

```
• Hands-on practice tour — learn secure, unlock, and copilot on our practice page in ~2 minutes
• Smarter copilot on paste and typing — fewer false positives on signup forms; better API key and IBAN detection
• Veil Plus — trusted contacts and magic links for personal sharing
• Team setup — clearer pricing, email-domain verification, and billing trial messaging
• Stability fixes across Outlook web, Gmail web, unlock links, and team join
```

**Full notes (Edge / internal):**

- **Practice tour** — guided 22-step walkthrough on `veil.goldspireventures.com/practice` (highlight → Quick → unlock → Options → Smart/Always/Off hints → copilot paste & typing).
- **Copilot** — improved paste/typing intercept; practice-only overrides removed; Off mode restores Smart after tour.
- **Veil Plus** — trusted contacts, magic-link claim flow, email verification (Brevo).
- **Portal** — sandwich pricing layout, geo currency (GBP/EUR/USD), Team 7-seat minimum, direct Chrome/Edge store links on install page.
- **Teams** — org email-domain MX verification; clearer create/join error messages when API unreachable.
- **Mail add-ins** — shared Outlook/Gmail unlock pane assets on portal (extension still required for compose).
- **Extension** — practice host content script, popup tour polish, selection/unlock reliability fixes.

---

## Pre-submit checklist

- [ ] `npm test` — 168/168
- [ ] `npm run product:e2e` — 29/29
- [ ] `npm run package:store` → `veil-1.5.0.zip`
- [ ] Upload ZIP in [Chrome Developer Dashboard](https://chrome.google.com/webstore/devconsole)
- [ ] Paste “What’s new” above
- [ ] Deploy portal + API (`npm run env:apply` then Cloudflare Pages + Railway)
- [ ] Set `CORS_ALLOW_ORIGINS=https://veil.goldspireventures.com` on API if not already

## Post-approval

- Confirm install page Chrome badge: https://chromewebstore.google.com/detail/veil/jecnnfblijhbkadedjpmkfmbfekeohml
- Edge: upload same ZIP to Partner Center
