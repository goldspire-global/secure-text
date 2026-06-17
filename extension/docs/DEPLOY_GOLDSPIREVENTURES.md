# Deploy (Goldspire Ventures) — Cloudflare Pages + Railway

Target hostnames:

- Join portal: `https://join-secure-text.goldspireventures.com/join.html` (Cloudflare Pages)
- Org API: `https://secure-text-api.goldspireventures.com` (Railway)

## 1) Deploy the join portal (Cloudflare Pages)

### A. Create Pages project

1. Cloudflare Dashboard → **Pages** → **Create a project**
2. Connect this Git repo
3. **Build settings**
   - Framework preset: **None**
   - Build command: *(empty)*
   - Build output directory: `/` (root)

### B. Ensure the file exists

This repo ships `join.html` at the repo root. Cloudflare Pages will publish it as:

- `https://<your-pages-project>.pages.dev/join.html`

### C. Add custom domain

Pages → your project → **Custom domains** → add:

- `join-secure-text.goldspireventures.com`

Cloudflare will create/verify the DNS record for you if your DNS is on Cloudflare.

## 2) Deploy the org API (Railway)

### A. Create the service

1. Railway → **New Project** → **Deploy from GitHub repo**
2. Select this repo
3. Service settings:
   - Start command: `npm run api:dev`
   - Health check path: `/health`

> Note: for production you may want a dedicated start script (same server, different name). The current `api:dev` is a normal Node server on `API_PORT`.

### B. Environment variables

Set these in Railway → Service → Variables:

- `API_PORT`: `3015` (or omit — defaults to 3015)
- `DATABASE_URL`: *(Supabase transaction pooler URL)*
- `DIRECT_URL`: *(Supabase session pooler URL; migrations only)*
- `CORS_ALLOW_ORIGINS`: `https://join-secure-text.goldspireventures.com`

### C. Add custom domain

Railway → Service → **Domains** → add:

- `secure-text-api.goldspireventures.com`

Railway will show you the DNS target. In Cloudflare DNS, add the record it requests.

## 3) Configure the extension build

In repo root `.env`:

```env
ORG_API_BASE=https://secure-text-api.goldspireventures.com
ORG_PORTAL_URL=https://join-secure-text.goldspireventures.com/join.html
```

Then:

```bash
npm run env:apply
npm run build
```

Load unpacked from `extension/` and reload the extension.

## 4) Expected production behavior

- CORS is **disabled by default** unless `CORS_ALLOW_ORIGINS` is set.
- Join portal can call the API only from `join-secure-text.goldspireventures.com`.
- The extension itself does not rely on CORS to talk to the API.

