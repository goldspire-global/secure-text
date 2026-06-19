# Veil billing & early access (internal)

How Team cloud pricing works, how long to run free early access, and how to switch to paid billing.

## List pricing (Team cloud)

| Item | Value |
|------|--------|
| Price | **$84 / user / year** (shown as $7 / user / month, billed annually) |
| Minimum seats | **5** |
| Enterprise | 100+ seats — custom contract; contact sales |
| Personal extension | Free |

Stripe checkout (API) and optional payment-link URLs live in `.env` → `portal/config.js` via `npm run env:apply`.

## What early access does

When early access is **on**:

- Create team requires **no card**
- Portal shows green **Early access** banner (create, pricing)
- Admin → **Overview → Billing** says “free, no card on file”
- API allows all org operations

When early access is **off**:

- Early-access copy hidden on pricing, create, index, terms (phase-aware UI)
- Admin billing shows **Subscribe** (Stripe Checkout via API) or payment link fallback
- **API enforces billing** on extension routes (join, sync, shares, tokens, events)
- Unpaid orgs after grace: HTTP **402** — “Team subscription required”
- Admin console stays available so teams can subscribe

### Enforcement (server-side)

| Route class | Unpaid after grace |
|-------------|-------------------|
| `POST /v1/extension/org/join` | Blocked |
| All provision-token routes (`sync`, shares, tokens, events) | Blocked |
| Admin `/v1/orgs/me/*` | Allowed (subscribe path) |
| `POST /v1/orgs` (create) | Allowed (14-day grace from creation) |

Billing state is stored in `organizations.settings.billing` — **clients cannot set it**. Admin PATCH strips any `billing` field from the request body. Only Stripe webhooks (signed) update subscription status.

Orgs created during early access are **grandfathered** (`billing.status: exempt` or created before `VEIL_EARLY_ACCESS_END`).

## How long should free early access run?

| Phase | Suggested duration | Gate |
|--------|-------------------|------|
| **Pilot** | 4–8 weeks after first prod deploy | Chrome **or** Edge store live; ops dashboard green |
| **Open early access** | **90 days** from announced GA date | Admin guide stable; low support load |
| **Paid GA** | After end date | `VEIL_EARLY_ACCESS_END` passed or `VEIL_EARLY_ACCESS=false` |

Set `VEIL_EARLY_ACCESS_END` at least **30 days ahead** on pricing/Terms.

## Automating the switchover

### Option A — Automatic by date (recommended)

```env
VEIL_EARLY_ACCESS=true
VEIL_EARLY_ACCESS_END=2026-12-31
```

Deploy portal once with `npm run env:apply`. After that date, portal UI and API both treat early access as off — **no redeploy required** for the date flip (env is baked at build; Railway API reads `.env` / Railway vars at runtime).

### Option B — Immediate off

```env
VEIL_EARLY_ACCESS=false
```

Redeploy **API (Railway)** and **portal (Cloudflare Pages)** after `npm run env:apply`.

## Switchover checklist (ops)

- [ ] Set `VEIL_EARLY_ACCESS_END` (or `VEIL_EARLY_ACCESS=false`) in production
- [ ] Confirm `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID_TEAM_ANNUAL` on Railway
- [ ] `npm run env:apply` → redeploy portal + push API to Railway
- [ ] Verify pricing/create/index/terms — no early-access copy when off
- [ ] Test Admin → Billing → Subscribe (Stripe test mode)
- [ ] Test webhook: `stripe listen --forward-to localhost:3015/v1/webhooks/stripe`
- [ ] Email active org admins (`organizations.admin_email`)
- [ ] Monitor ops dashboard + support for 2 weeks

## Environment reference

| Variable | Purpose |
|----------|---------|
| `VEIL_EARLY_ACCESS` | `true` / `false` — master switch |
| `VEIL_EARLY_ACCESS_END` | ISO date `YYYY-MM-DD` — auto-off after this day |
| `VEIL_BILLING_GRACE_DAYS` | Days after org create before API blocks (default `14`) |
| `STRIPE_PRICE_ID_TEAM_ANNUAL` | Price for Checkout API |
| `STRIPE_PAYMENT_LINK_TEAM` | Optional fallback link on marketing pages |
| `STRIPE_BILLING_PORTAL_URL` | Manage subscription |
| `STRIPE_WEBHOOK_SECRET` | Railway API `/v1/webhooks/stripe` |

## Related

- [MARKET_READY.md](MARKET_READY.md) — launch checklist
- [scripts/setup-stripe-veil.mjs](../scripts/setup-stripe-veil.mjs) — create products/links
- [api/src/billing.mjs](../api/src/billing.mjs) — enforcement logic
- [portal/billing.js](../portal/billing.js) — portal UI
