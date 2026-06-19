/**
 * Sync and verify signed learning bundles from Veil API.
 */
(function (global) {
  const BUNDLE_STORAGE_KEY = 'gstLearningBundleMeta';

  function apiBase() {
    return (global.GoldspireConstants?.ORG_API_BASE || '').replace(/\/$/, '');
  }

  function bundleSecret() {
    return global.GoldspireConstants?.LEARNING_BUNDLE_SECRET || '';
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

  function stableStringify(value) {
    if (value == null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) {
      return `[${value.map((item) => stableStringify(item)).join(',')}]`;
    }
    const keys = Object.keys(value).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
  }

  async function hmacHex(secret, body) {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      enc.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    const sig = await crypto.subtle.sign('HMAC', key, enc.encode(body));
    return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  async function verifyBundle(payload, signature) {
    const secret = bundleSecret();
    if (!secret || !payload || !signature) return false;
    const body = stableStringify(payload);
    const expected = await hmacHex(secret, body);
    return expected === String(signature).toLowerCase();
  }

  function flattenBundle(payload = {}) {
    return {
      learningBundle: payload,
      learningHints: Array.isArray(payload.hints) ? payload.hints : [],
      learningBundleVersion: payload.bundleVersion || '',
      learningSchemaVersion: payload.schemaVersion || 1,
    };
  }

  async function syncLearningBundle(orgId = '') {
    const base = apiBase();
    if (!base) return { ok: false, reason: 'no_api' };

    const params = new URLSearchParams();
    if (orgId) params.set('orgId', orgId);

    let response;
    try {
      response = await fetch(`${base}/v1/platform/learning-bundle?${params}`, {
        headers: {
          'X-Extension-Version': global.GoldspireBrowser?.api?.runtime?.getManifest?.()?.version || '',
        },
      });
    } catch (error) {
      return { ok: false, reason: 'network', error: String(error?.message || error) };
    }

    if (response.status === 304) return { ok: true, unchanged: true };
    if (!response.ok) return { ok: false, reason: 'api_error', status: response.status };

    const body = await response.json().catch(() => ({}));
    const payload = body.bundle || body.payload;
    const signature = body.signature || '';
    if (!payload) return { ok: true, unchanged: true };

    const valid = await verifyBundle(payload, signature);
    if (!valid) {
      return { ok: false, reason: 'invalid_signature' };
    }

    const current = await storageGet('sync', {});
    const patch = flattenBundle(payload);
    await storageSet('sync', { ...current, ...patch });
    await storageSet('local', {
      [BUNDLE_STORAGE_KEY]: {
        version: patch.learningBundleVersion,
        at: Date.now(),
        orgId: orgId || '',
      },
    });

    return { ok: true, version: patch.learningBundleVersion, hints: patch.learningHints.length };
  }

  async function readBundleFromSettings() {
    const settings = await global.GoldspireSettings?.load?.();
    return settings?.learningBundle || null;
  }

  global.GoldspireLearningBundle = {
    syncLearningBundle,
    verifyBundle,
    flattenBundle,
    readBundleFromSettings,
    BUNDLE_STORAGE_KEY,
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);
