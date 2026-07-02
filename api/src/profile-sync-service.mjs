import { getPool } from './db.mjs';
import { httpError } from './org-service.mjs';
import { authenticateRequest } from './auth.mjs';
import { authenticatePersonalRequest } from './personal-service.mjs';

/** Preference keys safe to sync across Chrome, Edge, etc. (no secrets). */
export const SYNCABLE_SETTING_KEYS = [
  'useSavedPassphrase',
  'showFloatingButton',
  'showSelectionPill',
  'selectionUiMode',
  'autoDetectRedacted',
  'defaultSecureMode',
  'copyOneTimeCodeAutomatically',
  'clipboardClearSeconds',
  'passwordLength',
  'passwordLowercase',
  'passwordUppercase',
  'passwordDigits',
  'passwordSymbols',
  'resecureAfterUnlock',
  'resecureDelaySeconds',
  'copilotEnabled',
  'copilotUserSet',
  'learningTelemetry',
  'tourComplete',
  'firstSecurePractice',
  'practiceTourPending',
];

function pickSyncableSettings(input = {}) {
  const out = {};
  if (!input || typeof input !== 'object') return out;
  for (const key of SYNCABLE_SETTING_KEYS) {
    if (input[key] !== undefined) out[key] = input[key];
  }
  return out;
}

function mergeSyncableSettings(base = {}, patch = {}) {
  return { ...pickSyncableSettings(base), ...pickSyncableSettings(patch) };
}

const MAX_SITE_RULES = 48;
const MAX_SNOOZED_HOSTS = 32;

function sanitizeCopilotMemory(input = {}) {
  const siteAllowRules = Array.isArray(input.siteAllowRules)
    ? input.siteAllowRules
      .filter((rule) => rule && typeof rule === 'object' && rule.host && rule.category)
      .slice(-MAX_SITE_RULES)
      .map((rule) => ({
        host: String(rule.host).slice(0, 128),
        category: String(rule.category).slice(0, 64),
        intent: String(rule.intent || '*').slice(0, 64),
        createdAt: Number(rule.createdAt) || Date.now(),
      }))
    : [];
  const snoozedHosts = Array.isArray(input.snoozedHosts)
    ? [...new Set(input.snoozedHosts.map((h) => String(h).slice(0, 128)).filter(Boolean))].slice(-MAX_SNOOZED_HOSTS)
    : [];
  return { siteAllowRules, snoozedHosts };
}

function splitSettingsSync(blob = {}) {
  const raw = blob && typeof blob === 'object' ? blob : {};
  const { copilotMemory, ...rest } = raw;
  return {
    settings: pickSyncableSettings(rest),
    copilotMemory: sanitizeCopilotMemory(copilotMemory),
  };
}

function mergeSettingsSyncBlob(current = {}, settingsPatch = {}, copilotMemoryPatch = null) {
  const base = current && typeof current === 'object' ? { ...current } : {};
  const mergedSettings = mergeSyncableSettings(base, settingsPatch);
  const copilotMemory = copilotMemoryPatch
    ? sanitizeCopilotMemory(copilotMemoryPatch)
    : sanitizeCopilotMemory(base.copilotMemory);
  return { ...mergedSettings, copilotMemory };
}

export async function getOrgProfileSync(token, deviceId) {
  const auth = await authenticateRequest(token, deviceId);
  if (!auth.member_id) {
    return { settings: {}, passphrase: null, needsPassphrase: false };
  }

  const pool = getPool();
  const member = await pool.query(
    `SELECT settings_sync FROM org_members WHERE id = $1`,
    [auth.member_id],
  );

  const split = splitSettingsSync(member.rows[0]?.settings_sync || {});

  return {
    settings: split.settings,
    copilotMemory: split.copilotMemory,
    /** Team passphrase is delivered via org join/sync policy — not duplicated here. */
    passphrase: null,
    needsPassphrase: false,
  };
}

export async function putOrgProfileSync(token, deviceId, body = {}) {
  const auth = await authenticateRequest(token, deviceId);
  if (!auth.member_id) throw httpError(400, 'Join your team before syncing profile settings.');

  const settings = pickSyncableSettings(body.settings);
  const copilotMemory = body.copilotMemory ? sanitizeCopilotMemory(body.copilotMemory) : null;
  const pool = getPool();
  const current = await pool.query(
    `SELECT settings_sync FROM org_members WHERE id = $1`,
    [auth.member_id],
  );
  const merged = mergeSettingsSyncBlob(current.rows[0]?.settings_sync || {}, settings, copilotMemory);

  await pool.query(
    `UPDATE org_members SET settings_sync = $2::jsonb, updated_at = now() WHERE id = $1`,
    [auth.member_id, JSON.stringify(merged)],
  );

  const split = splitSettingsSync(merged);
  return { ok: true, settings: split.settings, copilotMemory: split.copilotMemory };
}

export async function getPersonalProfileSync(token, deviceId) {
  const account = await authenticatePersonalRequest(token, deviceId);
  const pool = getPool();

  const [accountRow, deviceRow] = await Promise.all([
    pool.query(
      `SELECT passphrase_ciphertext, settings_sync FROM personal_accounts WHERE id = $1`,
      [account.id],
    ),
    pool.query(
      `SELECT sync_key_wrap FROM personal_device_provisions
       WHERE account_id = $1 AND device_id = $2 AND revoked_at IS NULL`,
      [account.id, deviceId],
    ),
  ]);

  const passphraseCiphertext = accountRow.rows[0]?.passphrase_ciphertext || '';
  const syncKeyWrap = deviceRow.rows[0]?.sync_key_wrap || '';
  const split = splitSettingsSync(accountRow.rows[0]?.settings_sync || {});

  return {
    settings: split.settings,
    copilotMemory: split.copilotMemory,
    passphrase: {
      ciphertext: passphraseCiphertext || null,
      syncKeyWrap: syncKeyWrap || null,
      hasCloudPassphrase: Boolean(passphraseCiphertext),
      needsPassphraseEntry: Boolean(passphraseCiphertext && !syncKeyWrap),
    },
  };
}

export async function putPersonalProfileSync(token, deviceId, body = {}) {
  const account = await authenticatePersonalRequest(token, deviceId);
  const pool = getPool();

  const settings = body.settings ? pickSyncableSettings(body.settings) : null;
  const copilotMemory = body.copilotMemory ? sanitizeCopilotMemory(body.copilotMemory) : null;
  const passphrase = body.passphrase && typeof body.passphrase === 'object' ? body.passphrase : null;

  if (settings || copilotMemory) {
    const current = await pool.query(
      `SELECT settings_sync FROM personal_accounts WHERE id = $1`,
      [account.id],
    );
    const merged = mergeSettingsSyncBlob(
      current.rows[0]?.settings_sync || {},
      settings || {},
      copilotMemory,
    );
    await pool.query(
      `UPDATE personal_accounts SET settings_sync = $2::jsonb, updated_at = now() WHERE id = $1`,
      [account.id, JSON.stringify(merged)],
    );
  }

  if (passphrase) {
    const ciphertext = String(passphrase.ciphertext || '').trim();
    const syncKeyWrap = String(passphrase.syncKeyWrap || '').trim();
    if (!ciphertext || !syncKeyWrap) {
      throw httpError(400, 'Passphrase sync payload is incomplete.');
    }

    await pool.query(
      `UPDATE personal_accounts SET passphrase_ciphertext = $2, updated_at = now() WHERE id = $1`,
      [account.id, ciphertext],
    );
    await pool.query(
      `UPDATE personal_device_provisions
       SET sync_key_wrap = $3, updated_at = now()
       WHERE account_id = $1 AND device_id = $2 AND revoked_at IS NULL`,
      [account.id, deviceId, syncKeyWrap],
    );
  }

  return getPersonalProfileSync(token, deviceId);
}
