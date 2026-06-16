# Enterprise deployment (GPO / Intune)

IT can push team settings to every install using **Chrome / Edge managed storage**. Users get one-click secure with **no passphrase popup** when `teamPassphrase` is set in policy.

## Recommended policy (one-click team mode)

```json
{
  "orgDisplayName": "Your Company",
  "securityProfile": "organization",
  "teamPassphrase": "YOUR-ROTATED-TEAM-SECRET-HERE",
  "passphraseFromVault": false,
  "useSavedPassphrase": true,
  "setupComplete": true,
  "defaultSecureMode": "team"
}
```

Replace `YOUR-ROTATED-TEAM-SECRET-HERE` with your shared team passphrase (16+ characters). **Rotate** by updating this policy — the extension re-applies on policy change.

Restrict who can edit extension policies in your MDM/GPO console. The passphrase transits through your management channel; treat it like any other deployed secret.

## Extension ID

Find it after install:

1. `chrome://extensions` or `edge://extensions`
2. Developer mode → **Goldspire Secure Text** → **Details**
3. Copy **Extension ID** (32-character string)

Use this ID in the registry paths below as `{extension_id}`.

## Google Chrome (Windows GPO)

Registry key:

```text
HKEY_LOCAL_MACHINE\SOFTWARE\Policies\Google\Chrome\3rdparty\extensions\{extension_id}
```

| Value name | Type | Data |
|------------|------|------|
| `policy` | REG_SZ | The JSON object above (single line) |

Or use **Google Chrome administrative templates** → Extension settings.

## Microsoft Edge (Windows GPO)

Registry key:

```text
HKEY_LOCAL_MACHINE\SOFTWARE\Policies\Microsoft\Edge\3rdparty\extensions\{extension_id}
```

Same `policy` REG_SZ JSON value as Chrome.

## Microsoft Intune

1. **Settings catalog** or **Administrative templates** for Chrome/Edge
2. Configure **ExtensionInstallForceList** to deploy the extension (`.crx` or Chrome Web Store ID)
3. Set **ExtensionSettings** / third-party extension policy with the JSON payload for `{extension_id}`

Exact OMA-URI names vary by Intune template version; search for “Chrome extension policy” or “Edge extension policy” in your tenant.

## What users see

- Banner: **Managed by {orgDisplayName}** (or “Managed by your organization”)
- Team passphrase field is locked (value is not shown — it comes from policy)
- First-run setup is skipped when `setupComplete` is true

## Policy fields

| Field | Type | Purpose |
|-------|------|---------|
| `orgId` | string | Internal org identifier (optional) |
| `orgDisplayName` | string | Shown in managed banner (optional) |
| `securityProfile` | `personal` \| `organization` | Force profile |
| `teamPassphrase` | string | Encrypted on device; enables one-click secure + generate |
| `passphraseFromVault` | boolean | `false` = store locally, no session prompts (recommended with `teamPassphrase`) |
| `useSavedPassphrase` | boolean | One-click secure |
| `setupComplete` | boolean | Skip onboarding |
| `defaultSecureMode` | `team` \| `one-time` | Default protection mode |

Legacy deployments may still use `passphraseIn1Password` — it maps to `passphraseFromVault`.

Schema file shipped with the extension: `schemas/managed_storage_schema.json`.

Team passphrase options for end users: [TEAM_VAULT.md](TEAM_VAULT.md).

## Verify

1. Deploy policy to a test machine
2. Restart Chrome/Edge (or wait for policy refresh)
3. Open extension popup → should show managed banner
4. Highlight text → `Ctrl+Shift+S` → secures with **no dialog**

## Security notes

- Passphrase is **encrypted at rest** on each device (same as manual Settings save).
- Policy JSON in registry/Intune is **plaintext** — restrict admin access to policy stores.
- For maximum separation, use **external vault mode** (`passphraseFromVault: true`) without `teamPassphrase` in policy; users enter from their password manager once per session.
