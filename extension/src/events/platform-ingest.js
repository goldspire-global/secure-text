/**
 * Sync signed learning bundle + upload personal decision telemetry.
 */
(function (global) {
  const DEVICE_KEY = 'gstAnonymousDeviceId';
  const CURSOR_KEY = 'gstPlatformDecisionsCursor';
  const STORAGE_KEY = 'gstVeilEvents';
  const MAX_BATCH = 50;

  function apiBase() {
    return (global.GoldspireConstants?.ORG_API_BASE || '').replace(/\/$/, '');
  }

  async function storageGet(area, defaults) {
    const gst = global.GoldspireBrowser;
    if (gst?.storageGet) return gst.storageGet(area, defaults);
    return { ...defaults };
  }

  async function storageSet(area, data) {
    const gst = global.GoldspireBrowser;
    if (!gst?.storage?.[area]?.set) return;
    await new Promise((resolve) => {
      gst.storage[area].set(data, resolve);
    });
  }

  async function anonymousDeviceHash() {
    const stored = await storageGet('local', { [DEVICE_KEY]: '' });
    let id = String(stored[DEVICE_KEY] || '').trim();
    if (!id) {
      const bytes = new Uint8Array(16);
      crypto.getRandomValues(bytes);
      id = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
      await storageSet('local', { [DEVICE_KEY]: id });
    }
    return id.slice(0, 32);
  }

  async function shouldUploadPersonal() {
    const settings = await global.GoldspireSettings?.load?.();
    if (!settings) return false;
    if (settings.securityProfile === 'organization' && settings.orgId) {
      return settings.productAnalytics !== false;
    }
    return settings.learningTelemetry !== false;
  }

  async function syncLearningBundle() {
    const settings = await global.GoldspireSettings?.load?.();
    const orgId = settings?.orgId && settings?.orgProvisionSource === 'cloud' ? settings.orgId : '';
    return global.GoldspireLearningBundle?.syncLearningBundle?.(orgId) || { ok: false };
  }

  async function collectPendingDecisions() {
    const { [STORAGE_KEY]: events = [], [CURSOR_KEY]: cursor = 0 } = await storageGet('local', {
      [STORAGE_KEY]: [],
      [CURSOR_KEY]: 0,
    });
    const list = Array.isArray(events) ? events : [];
    const since = Number(cursor) || 0;
    return list
      .filter((entry) => Number(entry?.at) > since && String(entry?.type) === 'decision')
      .slice(0, MAX_BATCH);
  }

  async function uploadPlatformDecisions() {
    if (!(await shouldUploadPersonal())) return { ok: true, uploaded: 0, skipped: true };

    const settings = await global.GoldspireSettings?.load?.();
    const isOrg = settings?.securityProfile === 'organization' && settings?.orgId;
    if (isOrg) return { ok: true, uploaded: 0, skipped: true };

    const base = apiBase();
    if (!base) return { ok: false, reason: 'no_api' };

    const pending = await collectPendingDecisions();
    if (pending.length === 0) return { ok: true, uploaded: 0 };

    const deviceHash = await anonymousDeviceHash();
    const version = global.GoldspireBrowser?.api?.runtime?.getManifest?.()?.version || '';
    const browser = (() => {
      const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
      if (/Edg\//i.test(ua)) return 'edge';
      if (/Firefox\//i.test(ua)) return 'firefox';
      if (/Chrome\//i.test(ua)) return 'chrome';
      return 'unknown';
    })();

    const events = pending.map((entry) => ({
      ...global.GoldspireVeilEvents?.sanitizeEntry?.(entry) || entry,
      deviceHash,
      extensionVersion: version,
      browser,
      profile: settings?.securityProfile || 'personal',
    }));

    let response;
    try {
      response = await fetch(`${base}/v1/platform/decisions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Ops-Ingest-Key': global.GoldspireConstants?.OPS_CLIENT_INGEST_KEY || '',
          'X-Extension-Version': version,
        },
        body: JSON.stringify({ events }),
      });
    } catch (error) {
      return { ok: false, reason: 'network', error: String(error?.message || error) };
    }

    if (!response.ok) {
      return { ok: false, reason: 'api_error', status: response.status };
    }

    const maxAt = pending.reduce((max, entry) => Math.max(max, Number(entry.at) || 0), 0);
    const { [CURSOR_KEY]: cursor = 0 } = await storageGet('local', { [CURSOR_KEY]: 0 });
    await storageSet('local', { [CURSOR_KEY]: Math.max(Number(cursor) || 0, maxAt) });

    const body = await response.json().catch(() => ({}));
    return { ok: true, uploaded: body.ingested ?? pending.length };
  }

  global.GoldspireVeilLearning = {
    syncLearningBundle,
    uploadPlatformDecisions,
    anonymousDeviceHash,
    shouldUploadPersonal,
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);
