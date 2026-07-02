/**
 * Cloud profile sync — preferences and personal passphrase follow the user across Chrome, Edge, etc.
 * Team passphrases are already delivered on org join/sync; this covers personal + user prefs.
 */
(function (global) {
  const PROFILE_SYNC_SALT = 'veil-profile-sync-v1';
  const SYNCABLE_KEYS = [
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

  function browser() {
    return global.GoldspireBrowser;
  }

  function bytesToBase64(bytes) {
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
  }

  function base64ToBytes(value) {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  async function deriveDeviceSyncKey(provisionToken) {
    const token = String(provisionToken || '').trim();
    if (!token) throw new Error('Missing provision token for profile sync.');

    const material = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(token),
      'HKDF',
      false,
      ['deriveKey'],
    );
    return crypto.subtle.deriveKey(
      {
        name: 'HKDF',
        hash: 'SHA-256',
        salt: new TextEncoder().encode(PROFILE_SYNC_SALT),
        info: new TextEncoder().encode('device-sync-key'),
      },
      material,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt'],
    );
  }

  async function aesEncrypt(key, plaintext) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      new TextEncoder().encode(plaintext),
    );
    return `${bytesToBase64(iv)}.${bytesToBase64(new Uint8Array(ciphertext))}`;
  }

  async function aesDecrypt(key, payload) {
    const [ivPart, cipherPart] = String(payload || '').split('.');
    if (!ivPart || !cipherPart) return '';
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: base64ToBytes(ivPart) },
      key,
      base64ToBytes(cipherPart),
    );
    return new TextDecoder().decode(decrypted);
  }

  async function wrapBytes(deviceKey, bytes) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      deviceKey,
      bytes,
    );
    return `${bytesToBase64(iv)}.${bytesToBase64(new Uint8Array(ciphertext))}`;
  }

  async function unwrapBytes(deviceKey, payload) {
    const [ivPart, cipherPart] = String(payload || '').split('.');
    if (!ivPart || !cipherPart) return null;
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: base64ToBytes(ivPart) },
      deviceKey,
      base64ToBytes(cipherPart),
    );
    return new Uint8Array(decrypted);
  }

  function pickSyncableSettings(settings = {}) {
    const out = {};
    for (const key of SYNCABLE_KEYS) {
      if (settings[key] !== undefined) out[key] = settings[key];
    }
    return out;
  }

  async function readSyncSettings() {
    const defaults = global.GoldspireSettings?.DEFAULT_SETTINGS || {};
    return browser()?.storageGet?.('sync', defaults) || defaults;
  }

  async function writeSyncSettings(patch) {
    const gst = browser();
    if (!gst?.storage?.sync?.set) return;
    const defaults = global.GoldspireSettings?.DEFAULT_SETTINGS || {};
    const current = await readSyncSettings();
    const merged = global.GoldspireSettings?.migrate?.({ ...current, ...patch }) || { ...current, ...patch };
    await new Promise((resolve) => gst.storage.sync.set(merged, () => resolve()));
  }

  async function mergeCloudSettings(cloudSettings = {}) {
    const patch = pickSyncableSettings(cloudSettings);
    if (!Object.keys(patch).length) return false;
    await writeSyncSettings(patch);
    return true;
  }

  const SITE_ALLOW_RULES_KEY = 'gstSiteAllowRules';
  const SNOOZED_HOSTS_KEY = 'gstSnoozedHosts';

  async function readLocalCopilotMemory() {
    const gst = browser();
    const stored = await gst?.storageGet?.('local', { [SITE_ALLOW_RULES_KEY]: [], [SNOOZED_HOSTS_KEY]: [] })
      || { [SITE_ALLOW_RULES_KEY]: [], [SNOOZED_HOSTS_KEY]: [] };
    return {
      siteAllowRules: Array.isArray(stored[SITE_ALLOW_RULES_KEY]) ? stored[SITE_ALLOW_RULES_KEY] : [],
      snoozedHosts: Array.isArray(stored[SNOOZED_HOSTS_KEY]) ? stored[SNOOZED_HOSTS_KEY] : [],
    };
  }

  async function applyCopilotMemory(copilotMemory = {}) {
    const gst = browser();
    if (!gst?.storage?.local?.set) return false;
    const siteAllowRules = Array.isArray(copilotMemory.siteAllowRules) ? copilotMemory.siteAllowRules : [];
    const snoozedHosts = Array.isArray(copilotMemory.snoozedHosts) ? copilotMemory.snoozedHosts : [];
    await new Promise((resolve) => {
      gst.storage.local.set({
        [SITE_ALLOW_RULES_KEY]: siteAllowRules,
        [SNOOZED_HOSTS_KEY]: snoozedHosts,
      }, resolve);
    });
    await global.GoldspireVeilAllowMemory?.loadSiteAllowRules?.();
    await global.GoldspireVeilSnooze?.load?.();
    return true;
  }

  async function pushCopilotMemory() {
    const memory = await readLocalCopilotMemory();
    const settings = await readSyncSettings();
    if (settings.securityProfile === 'organization' && settings.orgProvisionSource === 'cloud') {
      const data = await orgApiFetch('/v1/extension/profile-sync', {
        method: 'PUT',
        body: JSON.stringify({ copilotMemory: memory }),
      });
      return { ok: Boolean(data?.ok) };
    }
    const token = await global.GoldspirePersonalProvision?.loadToken?.();
    if (settings.personalAccountId || settings.personalEmail || token) {
      const data = await personalApiFetch('/v1/personal/profile-sync', {
        method: 'PUT',
        body: JSON.stringify({ copilotMemory: memory }),
      });
      return { ok: Boolean(data) };
    }
    return { ok: false };
  }

  async function orgApiFetch(path, options = {}) {
    const base = (global.GoldspireConstants?.ORG_API_BASE || '').replace(/\/$/, '');
    const token = await global.GoldspireOrgProvision?.loadProvisionToken?.();
    const deviceId = await global.GoldspireOrgProvision?.getDeviceId?.();
    if (!base || !token || !deviceId) return null;

    const response = await fetch(`${base}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'X-Device-Id': deviceId,
        ...(options.headers || {}),
      },
    });
    if (!response.ok) return null;
    return response.json();
  }

  async function personalApiFetch(path, options = {}) {
    if (!global.GoldspirePersonalProvision?.apiFetch) return null;
    try {
      return await global.GoldspirePersonalProvision.apiFetch(path, options);
    } catch {
      return null;
    }
  }

  async function pullOrgProfile() {
    const data = await orgApiFetch('/v1/extension/profile-sync');
    if (!data) return { ok: false };
    if (data.settings) await mergeCloudSettings(data.settings);
    if (data.copilotMemory) await applyCopilotMemory(data.copilotMemory);
    return { ok: true, settings: data.settings, copilotMemory: data.copilotMemory };
  }

  async function pushOrgProfile(settings) {
    const patch = pickSyncableSettings(settings || await readSyncSettings());
    const memory = await readLocalCopilotMemory();
    const body = {};
    if (Object.keys(patch).length) body.settings = patch;
    if (memory.siteAllowRules.length || memory.snoozedHosts.length) body.copilotMemory = memory;
    if (!Object.keys(body).length) return { ok: false };
    const data = await orgApiFetch('/v1/extension/profile-sync', {
      method: 'PUT',
      body: JSON.stringify(body),
    });
    return { ok: Boolean(data?.ok) };
  }

  async function buildPersonalPassphrasePayload(passphrase, provisionToken, existingMeta = null) {
    const trimmed = String(passphrase || '').trim();
    if (!trimmed) return null;

    const deviceKey = await deriveDeviceSyncKey(provisionToken);
    let accountSyncKey = null;

    if (existingMeta?.syncKeyWrap) {
      accountSyncKey = await unwrapBytes(deviceKey, existingMeta.syncKeyWrap);
    }
    if (!accountSyncKey) {
      accountSyncKey = crypto.getRandomValues(new Uint8Array(32));
    }

    const accountKey = await crypto.subtle.importKey(
      'raw',
      accountSyncKey,
      'AES-GCM',
      false,
      ['encrypt', 'decrypt'],
    );

    return {
      ciphertext: await aesEncrypt(accountKey, trimmed),
      syncKeyWrap: await wrapBytes(deviceKey, accountSyncKey),
    };
  }

  async function restorePersonalPassphraseFromCloud(passphraseMeta, provisionToken) {
    if (!passphraseMeta?.ciphertext || !passphraseMeta?.syncKeyWrap) return { restored: false };

    const deviceKey = await deriveDeviceSyncKey(provisionToken);
    const accountSyncKey = await unwrapBytes(deviceKey, passphraseMeta.syncKeyWrap);
    if (!accountSyncKey) return { restored: false };

    const accountKey = await crypto.subtle.importKey(
      'raw',
      accountSyncKey,
      'AES-GCM',
      false,
      ['encrypt', 'decrypt'],
    );
    const passphrase = await aesDecrypt(accountKey, passphraseMeta.ciphertext);
    if (!passphrase) return { restored: false };

    await global.GoldspireSecrets?.savePassphrase?.(passphrase, 'personal');
    return { restored: true, passphrase };
  }

  async function pullPersonalProfile() {
    const data = await personalApiFetch('/v1/personal/profile-sync');
    if (!data) return { ok: false };

    if (data.settings) await mergeCloudSettings(data.settings);
    if (data.copilotMemory) await applyCopilotMemory(data.copilotMemory);

    const token = await global.GoldspirePersonalProvision?.loadToken?.();
    const passphraseMeta = data.passphrase || {};
    let restored = false;
    let needsPassphraseEntry = passphraseMeta.needsPassphraseEntry === true;

    if (token && passphraseMeta.ciphertext && passphraseMeta.syncKeyWrap) {
      const result = await restorePersonalPassphraseFromCloud(passphraseMeta, token);
      restored = result.restored === true;
      needsPassphraseEntry = !restored && passphraseMeta.hasCloudPassphrase === true;
    }

    if (restored) {
      await writeSyncSettings({ setupComplete: true, profileNeedsPassphraseEntry: false });
    } else if (needsPassphraseEntry) {
      await writeSyncSettings({ profileNeedsPassphraseEntry: true });
    }

    return {
      ok: true,
      restoredPassphrase: restored,
      needsPassphraseEntry,
    };
  }

  async function pushPersonalProfile(options = {}) {
    const token = await global.GoldspirePersonalProvision?.loadToken?.();
    if (!token) return { ok: false };

    const body = {};
    const settings = options.settings || await readSyncSettings();
    const settingsPatch = pickSyncableSettings(settings);
    if (Object.keys(settingsPatch).length) body.settings = settingsPatch;

    const memory = options.copilotMemory || await readLocalCopilotMemory();
    if (memory.siteAllowRules?.length || memory.snoozedHosts?.length) {
      body.copilotMemory = memory;
    }

    if (options.passphrase) {
      const existing = await personalApiFetch('/v1/personal/profile-sync');
      body.passphrase = await buildPersonalPassphrasePayload(
        options.passphrase,
        token,
        existing?.passphrase || null,
      );
    }

    if (!Object.keys(body).length) return { ok: false };

    const data = await personalApiFetch('/v1/personal/profile-sync', {
      method: 'PUT',
      body: JSON.stringify(body),
    });
    return { ok: Boolean(data) };
  }

  async function linkPersonalPassphrase(passphrase) {
    return pushPersonalProfile({ passphrase });
  }

  async function pullForCurrentProfile() {
    const settings = await readSyncSettings();
    if (settings.securityProfile === 'organization' && settings.orgProvisionSource === 'cloud') {
      return pullOrgProfile();
    }
    if (settings.personalAccountId || settings.personalEmail) {
      return pullPersonalProfile();
    }
    return { ok: false };
  }

  async function pushForCurrentProfile(patch = null) {
    const settings = patch || await readSyncSettings();
    if (settings.securityProfile === 'organization' && settings.orgProvisionSource === 'cloud') {
      return pushOrgProfile(settings);
    }
    if (settings.personalAccountId || settings.personalEmail) {
      return pushPersonalProfile({ settings });
    }
    return { ok: false };
  }

  let pushTimer = null;
  let copilotPushTimer = null;

  function schedulePush(delayMs = 1500) {
    if (pushTimer) clearTimeout(pushTimer);
    pushTimer = setTimeout(() => {
      pushTimer = null;
      pushForCurrentProfile().catch(() => {});
    }, delayMs);
  }

  function scheduleCopilotMemoryPush(delayMs = 2000) {
    if (copilotPushTimer) clearTimeout(copilotPushTimer);
    copilotPushTimer = setTimeout(() => {
      copilotPushTimer = null;
      pushCopilotMemory().catch(() => {});
    }, delayMs);
  }

  global.GoldspireProfileSync = {
    pullOrgProfile,
    pushOrgProfile,
    pullPersonalProfile,
    pushPersonalProfile,
    linkPersonalPassphrase,
    pullForCurrentProfile,
    pushForCurrentProfile,
    pushCopilotMemory,
    applyCopilotMemory,
    schedulePush,
    scheduleCopilotMemoryPush,
    pickSyncableSettings,
    SYNCABLE_KEYS,
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);
