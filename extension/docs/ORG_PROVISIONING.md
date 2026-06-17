# Organization provisioning

How users join an organization and receive team policy **without manual passphrase entry**.

## Two lanes

| Lane | Who | Matching | Rotation |
|------|-----|----------|----------|
| **Enterprise (MDM)** | IT-managed Chrome/Edge | Device is in corp policy scope | IT updates GPO/Intune JSON |
| **Cloud (self-serve)** | Store install, BYOD | Join code or SSO sign-in | Admin rotates in Goldspire console → extension syncs |

Personal mode is unchanged — user owns their passphrase locally.

## Enterprise lane (live today)

IT deploys the extension + managed storage policy. See [ENTERPRISE.md](ENTERPRISE.md).

When policy includes `teamPassphrase`:

1. Extension applies policy on install, startup, and policy change
2. **Setup wizard is skipped** — user lands in Team mode
3. Team passphrase is encrypted on device — one-click secure
4. IT rotates by updating `teamPassphrase` in policy — **no user action**

Optional policy fields: `orgId`, `orgDisplayName` (banner branding).

## Cloud lane (extension ready; API TBD)

For teams without MDM. User flow:

1. Install extension → **Team / Organization**
2. Enter **join code** from admin, or **Sign in with organization**
3. Extension receives org policy + team passphrase
4. Background sync every 6 hours (and on popup open) picks up rotations

### Join code API (to implement on backend)

```http
POST /v1/extension/org/join
X-Device-Id: {uuid}
Content-Type: application/json

{ "joinCode": "ACME-7K2M", "deviceId": "{uuid}" }
```

Response:

```json
{
  "orgId": "acme-corp",
  "orgDisplayName": "Acme Corp",
  "teamPassphrase": "…",
  "policyVersion": 3,
  "provisionToken": "…",
  "settings": {
    "passphraseFromVault": false,
    "useSavedPassphrase": true,
    "defaultSecureMode": "team"
  }
}
```

### Sync API

```http
GET /v1/extension/org/sync
Authorization: Bearer {provisionToken}
X-Device-Id: {uuid}
X-Policy-Version: 3
```

Returns `304` if unchanged, or new policy payload (same shape as join).

### SSO callback

After sign-in at `ORG_PORTAL_URL`, the portal calls the extension via `externally_connectable`:

```javascript
chrome.runtime.sendMessage(extensionId, {
  type: 'ORG_PROVISION',
  payload: { /* same as join response */ }
});
```

Configure `ORG_API_BASE` and `ORG_PORTAL_URL` in `src/constants.js` when deploying (defaults to `http://localhost:3015` for local dev).

### Production example (Goldspire Ventures)

- `ORG_API_BASE`: `https://secure-text-api.goldspireventures.com`
- `ORG_PORTAL_URL`: `https://join-secure-text.goldspireventures.com/join.html`
- API env `CORS_ALLOW_ORIGINS`: `https://join-secure-text.goldspireventures.com`

## Local dev

```bash
# From this repo root (see SETUP.md)
npm install
npm run env:apply
npm run setup:cloud
npm run api:dev
```

Demo join code (after seed): **`DEMO-N0VA7`** (Nova Care org).

Reload the extension, pick **Team / Organization**, enter the join code or use **Sign in with organization**.

## External vault mode (optional)

For orgs that **refuse** to store the team passphrase on device or in cloud policy:

- Set `passphraseFromVault: true` in MDM policy or cloud settings
- Users enter from their password manager once per browser session

This is a security trade-off, not the default.

## What we removed as primary path

Manual “IT emails everyone a new passphrase → update Settings” is **not** a supported rollout model. Legacy manual fields remain hidden when an org is provisioned.
