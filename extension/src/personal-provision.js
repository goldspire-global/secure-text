/**
 * Veil Plus — personal cloud account (trusted contacts, direct share).
 */
(function (global) {
  const DEVICE_ID_KEY = 'gstOrgDeviceId';
  const PERSONAL_TOKEN_KEY = 'gstPersonalProvisionToken';

  function browser() {
    return global.GoldspireBrowser;
  }

  function apiBase() {
    return (global.GoldspireConstants?.ORG_API_BASE || '').replace(/\/$/, '');
  }

  function portalUrl() {
    return (global.GoldspireConstants?.PORTAL_ORIGIN || '').replace(/\/$/, '');
  }

  function clientMetaHeaders(deviceId) {
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
    let clientBrowser = 'Unknown';
    if (/Edg\//i.test(ua)) clientBrowser = 'Microsoft Edge';
    else if (/Firefox\//i.test(ua)) clientBrowser = 'Firefox';
    else if (/Chrome\//i.test(ua)) clientBrowser = 'Chrome';
    let clientPlatform = '';
    if (/Windows/i.test(ua)) clientPlatform = 'Windows';
    else if (/Macintosh/i.test(ua)) clientPlatform = 'macOS';
    return {
      'X-Device-Id': deviceId,
      'X-Extension-Version': browser()?.runtime?.getManifest?.()?.version || '',
      'X-Client-Browser': clientBrowser,
      'X-Client-Platform': clientPlatform,
    };
  }

  async function getDeviceId() {
    return global.GoldspireOrgProvision?.getDeviceId?.() || '';
  }

  async function saveToken(token) {
    if (!token?.trim()) {
      await new Promise((resolve) => browser()?.storage?.local?.remove?.(PERSONAL_TOKEN_KEY, resolve));
      return;
    }
    const encrypted = await global.GoldspireSecrets?.encryptForStorage?.(token.trim());
    if (!encrypted) return;
    await new Promise((resolve) => {
      browser()?.storage?.local?.set?.({ [PERSONAL_TOKEN_KEY]: encrypted }, resolve);
    });
  }

  async function loadToken() {
    const stored = await browser()?.storageGet?.('local', { [PERSONAL_TOKEN_KEY]: '' });
    if (!stored?.[PERSONAL_TOKEN_KEY]) return '';
    try {
      return (await global.GoldspireSecrets?.decryptFromStorage?.(stored[PERSONAL_TOKEN_KEY])) || '';
    } catch {
      return '';
    }
  }

  async function apiFetch(path, options = {}) {
    const base = apiBase();
    if (!base) throw new Error('Veil cloud is not configured.');

    const deviceId = await getDeviceId();
    const token = await loadToken();
    if (!token) throw new Error('Register your email in Veil Plus settings first.');

    const response = await fetch(`${base}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...clientMetaHeaders(deviceId),
        ...(options.headers || {}),
      },
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.message || body.error || `Request failed (${response.status}).`);
    }
    if (response.status === 204) return null;
    return response.json();
  }

  async function writeSync(patch) {
    const gst = browser();
    if (!gst?.storage?.sync) return;
    const defaults = global.GoldspireSettings?.DEFAULT_SETTINGS || {};
    const current = await gst.storageGet('sync', defaults);
    const merged = global.GoldspireSettings?.migrate?.({ ...current, ...patch }) || { ...current, ...patch };
    await new Promise((resolve) => gst.storage.sync.set(merged, () => resolve()));
  }

  async function register(email) {
    const deviceId = await getDeviceId();
    const base = apiBase();
    if (!base) throw new Error('Veil cloud is not configured.');

    const response = await fetch(`${base}/v1/personal/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...clientMetaHeaders(deviceId) },
      body: JSON.stringify({ email: String(email || '').trim() }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.message || body.error || 'Registration failed.');

    if (body.provisionToken) await saveToken(body.provisionToken);
    await writeSync({
      personalAccountId: body.accountId || '',
      personalEmail: body.email || email,
      personalEmailVerified: body.emailVerified === true,
      personalPlusActive: body.plusActive === true,
      personalContactLimit: body.contactLimit || body.includedContacts || 6,
      personalIncludedContacts: body.includedContacts || 6,
      personalExtraContactSlots: body.extraContactSlots || 0,
    });

    let profilePull = {};
    if (global.GoldspireProfileSync?.pullPersonalProfile) {
      try {
        profilePull = await global.GoldspireProfileSync.pullPersonalProfile();
      } catch {
        profilePull = {};
      }
    }

    return { ...body, ...profilePull };
  }

  async function sendVerificationEmail() {
    return apiFetch('/v1/personal/verify/send', { method: 'POST', body: '{}' });
  }

  async function syncStatus() {
    try {
      const status = await apiFetch('/v1/personal/status');
      await writeSync({
        personalAccountId: status.accountId || '',
        personalEmail: status.email || '',
        personalEmailVerified: status.emailVerified === true,
        personalPlusActive: status.plusActive === true,
        personalContactLimit: status.contactLimit || status.includedContacts || 6,
        personalIncludedContacts: status.includedContacts || 6,
        personalExtraContactSlots: status.extraContactSlots || 0,
        personalContactCount: status.contactCount || 0,
        personalPendingShareCount: status.pendingShareCount || 0,
      });
      if (global.GoldspireProfileSync?.pullPersonalProfile) {
        await global.GoldspireProfileSync.pullPersonalProfile().catch(() => {});
      }
      return status;
    } catch {
      return null;
    }
  }

  async function startCheckout() {
    const result = await apiFetch('/v1/personal/checkout', { method: 'POST', body: '{}' });
    if (!result?.url) throw new Error('Could not start checkout.');
    return result.url;
  }

  async function purchaseContactSlot() {
    return apiFetch('/v1/personal/contacts/purchase-slot', { method: 'POST', body: '{}' });
  }

  function plusPageUrl() {
    const base = portalUrl();
    return base ? `${base}/plus.html` : 'https://veil.goldspireventures.com/plus.html';
  }

  global.GoldspirePersonalProvision = {
    register,
    syncStatus,
    sendVerificationEmail,
    startCheckout,
    purchaseContactSlot,
    plusPageUrl,
    loadToken,
    apiFetch,
    getDeviceId,
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);
