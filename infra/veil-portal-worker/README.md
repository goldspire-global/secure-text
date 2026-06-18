# join-veil.goldspireventures.com portal proxy

Cloudflare Worker that proxies `join-veil.goldspireventures.com` to the `secure-text` Pages project (`secure-text.pages.dev`).

Used because Wrangler OAuth can attach a Worker custom domain (auto DNS) but cannot create zone DNS records for a pending Pages custom domain.

## Deploy / update

```bash
cd infra/veil-portal-worker
npx wrangler deploy
```

Requires `wrangler login` (Cloudflare account with `goldspireventures.com` zone).

## Remove later

When `join-veil` is attached directly to the Pages project with DNS active, delete this worker:

```bash
npx wrangler delete veil-portal-alias
```
