# Setup on a new machine

Repo: **https://github.com/goldspire-global/secure-text**

## 1. Clone

```bash
git clone https://github.com/goldspire-global/secure-text.git
cd secure-text
```

## 2. Configure `.env`

```bash
copy .env.example .env    # Windows cmd
# cp .env.example .env    # macOS / Linux
```

Edit **`.env`** in the repo root:

| Variable | Dev value | Production |
|----------|-----------|------------|
| `ORG_API_BASE` | `http://localhost:3015` | e.g. `https://secure-text-api.goldspireventures.com` |
| `ORG_PORTAL_URL` | `http://localhost:3015/secure-text/join` | e.g. `https://join-secure-text.goldspireventures.com/join.html` |
| `BUILT_IN_PUBLIC_UNLOCK_URL` | `https://goldspire-global.github.io/secure-text/unlock.html` | Same (GitHub Pages) |

## 3. Apply config to the extension

**Windows PowerShell** often blocks `npm` scripts. Use any of these:

```powershell
# Option A — bypass PowerShell script policy for npm
npm.cmd run env:apply

# Option B — call node directly (no npm needed)
node scripts/apply-env.mjs
```

```bash
# macOS / Linux / Git Bash
npm run env:apply
```

This writes `extension/src/constants.js` from your `.env`.

## 4. Load the extension

1. Chrome/Edge → `chrome://extensions`
2. Developer mode **on**
3. **Load unpacked** → select the **`extension/`** folder inside the clone
4. After code or `.env` changes: run `env:apply` again, then click **Reload** on the extension card

## 5. Cloud org join (optional — local API in this repo)

The extension can join teams via join code when the cloud API is running. Everything lives in this repo under **`api/`** — no separate monorepo needed.

### Supabase `.env`

| Variable | Use |
|----------|-----|
| `DATABASE_URL` | **Transaction pooler** — port **6543** (`*.pooler.supabase.com`) |
| `DIRECT_URL` | **Session pooler** — port **5432** (same host) — for migrations only |
| `ORG_API_BASE` | `http://localhost:3015` (must match running API) |

From repo root:

```powershell
npm install
npm run env:apply
npm run setup:cloud    # migrate + seed Supabase
npm.cmd run api:dev      # Windows — API on :3015
```

```bash
npm install
npm run env:apply
npm run setup:cloud
npm run api:dev
```

Demo join code after seed: **`DEMO-N0VA7`** (Nova Care org).

### Share with specific people (Phase 2)

After joining, each user registers a **work email** (setup wizard or Settings). The extension generates a keypair; the server only stores the **public** key and encrypted unlock deliveries.

**Try it with two browser profiles:**

1. Profile A — join org, email `alice@novacare.demo`
2. Profile B — join org, email `bob@novacare.demo`
3. Profile A — highlight text → **Secure with options…** → **Specific people (org inbox)** → `bob@novacare.demo`
4. Profile B — open the same page, click **[redacted]** → unlocks automatically (key delivered via org inbox sync)

No email service required — delivery is extension ↔ API ↔ extension.

### Quick test (extension only, no backend)

- **Enterprise / MDM:** push `teamPassphrase` via GPO/Intune — see `extension/docs/ENTERPRISE.md`
- **Personal mode:** no cloud API needed

## 6. Build & publish unlock page (optional)

Updates **https://goldspire-global.github.io/secure-text/unlock.html**

```bash
npm.cmd run build    # Windows
npm run build        # macOS / Linux
git add -A && git commit -m "Update unlock page" && git push
```

## 7. Reload checklist after pull

```text
git pull
node scripts/apply-env.mjs     # or npm.cmd run env:apply
chrome://extensions → Reload
```

## Docs index

| Doc | Topic |
|-----|-------|
| `extension/docs/ORG_PROVISIONING.md` | Cloud join + sync API |
| `extension/docs/ENTERPRISE.md` | GPO / Intune managed policy |
| `extension/docs/TEAM_VAULT.md` | External vault vs provisioned policy |
| `extension/docs/THREAT_MODEL.md` | Security model |
| `extension/SECURITY.md` | Crypto & storage |
