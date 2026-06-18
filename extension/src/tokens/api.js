/**
 * Secure token API — background broker (ciphertext only on wire).
 */
(function (global) {
  function apiBase() {
    return (global.GoldspireConstants?.ORG_API_BASE || '').replace(/\/$/, '');
  }

  function hasLocalProvision() {
    return typeof global.GoldspireOrgProvision?.loadProvisionToken === 'function';
  }

  async function broker(method, payload) {
    const response = await global.GoldspireBrowser?.sendMessage?.({
      type: 'VEIL_TOKEN_API',
      method,
      payload,
    });
    if (!response?.ok) {
      throw new Error(response?.error || 'Token request failed.');
    }
    return response.result;
  }

  async function authHeaders() {
    const deviceId = await global.GoldspireOrgProvision.getDeviceId();
    const token = await global.GoldspireOrgProvision.loadProvisionToken();
    return {
      deviceId,
      token,
      headers: {
        Authorization: `Bearer ${token}`,
        'X-Device-Id': deviceId,
        'X-Extension-Version': global.GoldspireBrowser?.api?.runtime?.getManifest?.()?.version || '',
        'Content-Type': 'application/json',
      },
    };
  }

  async function apiFetch(path, options = {}) {
    const base = apiBase();
    if (!base) throw new Error('Cloud tokens require org API.');

    const auth = await authHeaders();
    if (!auth.token) {
      throw new Error('Sign in to your organization in Veil settings to use tokens.');
    }

    const response = await fetch(`${base}${path}`, {
      ...options,
      headers: {
        ...auth.headers,
        ...(options.headers || {}),
      },
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.message || body.error || `Token request failed (${response.status}).`);
    }

    return response.json();
  }

  async function createTokenRecord(payload) {
    if (!hasLocalProvision()) {
      return broker('createTokenRecord', payload);
    }
    return apiFetch('/v1/extension/tokens', {
      method: 'POST',
      body: JSON.stringify({
        ciphertext: payload.ciphertext,
        category: payload.category || '',
        ttlMs: payload.ttlMs,
        maxReads: payload.maxReads,
        burnAfterRead: payload.burnAfterRead,
      }),
    });
  }

  async function resolveTokenRecord(tokenId) {
    if (!hasLocalProvision()) {
      return broker('peekTokenRecord', { tokenId });
    }
    const id = encodeURIComponent(String(tokenId || '').trim());
    return apiFetch(`/v1/extension/tokens/${id}`, { method: 'GET' });
  }

  async function consumeTokenRecord(tokenId) {
    if (!hasLocalProvision()) {
      return broker('consumeTokenRecord', { tokenId });
    }
    const id = encodeURIComponent(String(tokenId || '').trim());
    return apiFetch(`/v1/extension/tokens/${id}/consume`, { method: 'POST' });
  }

  global.GoldspireVeilTokenApi = {
    createTokenRecord,
    resolveTokenRecord,
    peekTokenRecord: resolveTokenRecord,
    consumeTokenRecord,
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);
