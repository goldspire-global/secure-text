import { randomBytes } from 'node:crypto';
import { getPool } from './db.mjs';
import { assertMemberEmailAllowed } from './membership.mjs';
import { normalizeEmail } from './auth.mjs';
import { getMemberTeamPolicy } from './teams-service.mjs';

async function touchDeviceClientInfo(pool, orgId, deviceId, clientInfo = {}) {
  const device = String(deviceId || '').trim();
  if (!device || !orgId) return;
  const ext = String(clientInfo.extensionVersion || '').slice(0, 32);
  const browser = String(clientInfo.browser || '').slice(0, 64);
  const platform = String(clientInfo.platform || '').slice(0, 64);
  if (!ext && !browser && !platform) return;

  await pool.query(
    `UPDATE device_provisions
     SET extension_version = CASE WHEN $3 <> '' THEN $3 ELSE extension_version END,
         browser = CASE WHEN $4 <> '' THEN $4 ELSE browser END,
         platform = CASE WHEN $5 <> '' THEN $5 ELSE platform END,
         updated_at = now()
     WHERE org_id = $1 AND device_id = $2`,
    [orgId, device, ext, browser, platform],
  );
}

function newProvisionToken() {
  return randomBytes(32).toString('hex');
}

function orgPayload(org, provisionToken, teamContext = null) {
  const settings = typeof org.settings === 'object' && org.settings ? org.settings : {};
  const baseSettings = {
    passphraseFromVault: settings.passphraseFromVault === true,
    useSavedPassphrase: settings.useSavedPassphrase !== false,
    defaultSecureMode: settings.defaultSecureMode === 'one-time' ? 'one-time' : 'team',
    enforceStrongPassphrase: settings.enforceStrongPassphrase !== false,
    copilotEnabled: settings.copilotEnabled !== false,
    productAnalytics: settings.productAnalytics !== false,
      selectionUiMode: ['quiet', 'smart', 'always'].includes(settings.selectionUiMode)
      ? settings.selectionUiMode
      : 'smart',
    membershipPolicy: ['open', 'invite', 'domain'].includes(settings.membershipPolicy)
      ? settings.membershipPolicy
      : 'invite',
    allowedEmailDomains: Array.isArray(settings.allowedEmailDomains)
      ? settings.allowedEmailDomains
      : [],
    ...(settings.resecureDelaySeconds != null
      ? { resecureDelaySeconds: settings.resecureDelaySeconds }
      : {}),
    ...(settings.dlp && typeof settings.dlp === 'object' ? { dlp: settings.dlp } : {}),
    ...(settings.analytics && typeof settings.analytics === 'object'
      ? { analytics: { siemWebhookConfigured: Boolean(settings.analytics.siemWebhookUrl) } }
      : {}),
  };

  if (teamContext?.teamId) {
    baseSettings.teamId = teamContext.teamId;
    baseSettings.teamName = teamContext.teamName;
    if (teamContext.settings?.dlp && typeof teamContext.settings.dlp === 'object') {
      baseSettings.teamDlp = teamContext.settings.dlp;
    }
  }

  return {
    orgId: org.id,
    orgDisplayName: org.display_name,
    teamPassphrase: org.team_passphrase,
    policyVersion: org.policy_version,
    provisionToken,
    settings: baseSettings,
  };
}

function normalizeJoinCode(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '');
}

export async function joinWithCode(joinCode, deviceId, email, clientInfo = {}) {
  const code = normalizeJoinCode(joinCode);
  const device = String(deviceId || '').trim();
  const memberEmail = normalizeEmail(email);
  if (!code) throw httpError(400, 'Enter your join code.');
  if (!device) throw httpError(400, 'Missing device id.');
  if (!memberEmail || !memberEmail.includes('@')) {
    throw httpError(400, 'Valid work email is required.');
  }

  const pool = getPool();
  const joinResult = await pool.query(
    `SELECT jc.code, o.id, o.display_name, o.team_passphrase, o.policy_version, o.settings
     FROM join_codes jc
     JOIN organizations o ON o.id = jc.org_id
     WHERE UPPER(REPLACE(REPLACE(jc.code, '-', ''), ' ', '')) = $1
       AND jc.active = true
       AND (jc.expires_at IS NULL OR jc.expires_at > now())`,
    [code],
  );

  if (joinResult.rowCount === 0) {
    console.warn('[org/join] invalid or expired join code attempt');
    throw httpError(404, 'Invalid or expired join code.');
  }

  const org = joinResult.rows[0];
  const orgSettings = typeof org.settings === 'object' && org.settings ? org.settings : {};
  await assertMemberEmailAllowed(pool, org.id, memberEmail, device, orgSettings);

  const token = newProvisionToken();

  const ext = String(clientInfo.extensionVersion || '').slice(0, 32);
  const browser = String(clientInfo.browser || '').slice(0, 64);
  const platform = String(clientInfo.platform || '').slice(0, 64);

  const provisionResult = await pool.query(
    `INSERT INTO device_provisions (org_id, device_id, provision_token, policy_version, extension_version, browser, platform)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (org_id, device_id) DO UPDATE SET
       provision_token = EXCLUDED.provision_token,
       policy_version = EXCLUDED.policy_version,
       extension_version = CASE WHEN EXCLUDED.extension_version <> '' THEN EXCLUDED.extension_version ELSE device_provisions.extension_version END,
       browser = CASE WHEN EXCLUDED.browser <> '' THEN EXCLUDED.browser ELSE device_provisions.browser END,
       platform = CASE WHEN EXCLUDED.platform <> '' THEN EXCLUDED.platform ELSE device_provisions.platform END,
       revoked_at = NULL,
       updated_at = now()
     RETURNING provision_token`,
    [org.id, device, token, org.policy_version, ext, browser, platform],
  );

  const provisionToken = provisionResult.rows[0].provision_token;

  await pool.query(
    `UPDATE org_members
     SET device_id = $1, updated_at = now()
     WHERE org_id = $2 AND email = $3 AND active = true
       AND (device_id IS NULL OR device_id = $1)`,
    [device, org.id, memberEmail],
  );

  const teamContext = await getMemberTeamPolicy(org.id, memberEmail);
  return orgPayload(org, provisionToken, teamContext);
}

export async function syncPolicy(token, deviceId, clientPolicyVersion, clientInfo = {}) {
  const device = String(deviceId || '').trim();
  const bearer = String(token || '').trim();
  if (!bearer) throw httpError(401, 'Missing provision token.');
  if (!device) throw httpError(400, 'Missing device id.');

  const pool = getPool();
  const result = await pool.query(
    `SELECT dp.provision_token, dp.policy_version AS client_version, dp.revoked_at,
            o.id, o.display_name, o.team_passphrase, o.policy_version, o.settings
     FROM device_provisions dp
     JOIN organizations o ON o.id = dp.org_id
     WHERE dp.provision_token = $1 AND dp.device_id = $2`,
    [bearer, device],
  );

  if (result.rowCount === 0) {
    throw httpError(401, 'Invalid provision token.');
  }

  const row = result.rows[0];
  if (row.revoked_at) {
    throw httpError(401, 'Provision revoked.');
  }

  await touchDeviceClientInfo(pool, row.id, device, clientInfo);

  const clientVersion = Number(clientPolicyVersion) || 0;
  if (clientVersion >= row.policy_version) {
    return { unchanged: true };
  }

  await pool.query(
    `UPDATE device_provisions
     SET policy_version = $1, updated_at = now()
     WHERE provision_token = $2`,
    [row.policy_version, bearer],
  );

  const memberResult = await pool.query(
    `SELECT email FROM org_members
     WHERE org_id = $1 AND device_id = $2 AND active = true
     LIMIT 1`,
    [row.id, device],
  );
  const teamContext = await getMemberTeamPolicy(
    row.id,
    memberResult.rows[0]?.email || null,
  );

  return {
    unchanged: false,
    payload: orgPayload(row, bearer, teamContext),
  };
}

export function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}
