/**
 * Optional 1Password cross-extension save (requires 1Password allowlist).
 * @see https://github.com/1Password/extension-messaging
 */
(function (global) {
  const OP_EXTENSION_IDS = [
    'aeblfdkhhhdcdjpifhhbdiojplfjncoa', // 1Password for Chrome
    'dghdojbkjhnklbpkdaibdccddilifddb', // 1Password for Edge
  ];

  function runtime() {
    return global.GoldspireBrowser?.runtime || global.chrome?.runtime || global.browser?.runtime;
  }

  function sendToOp(extensionId, message) {
    return new Promise((resolve) => {
      try {
        runtime()?.sendMessage?.(extensionId, message, (response) => {
          if (runtime()?.lastError) {
            resolve(null);
            return;
          }
          resolve(response ?? null);
        });
      } catch {
        resolve(null);
      }
    });
  }

  async function ping() {
    for (const id of OP_EXTENSION_IDS) {
      const response = await sendToOp(id, { name: 'hello' });
      if (response?.name === 'hello') return { available: true, extensionId: id };
    }
    return { available: false, extensionId: null };
  }

  async function createItem(extensionId, template, item) {
    const response = await sendToOp(extensionId, {
      name: 'create-item',
      data: { template, item },
    });
    return Boolean(response?.data?.saved || response?.data?.created);
  }

  async function saveLogin({ title, username = '', password, notes = '', url = '' }) {
    const { available, extensionId } = await ping();
    if (!available) {
      return { ok: false, reason: '1Password extension not found or integration not allowlisted yet.' };
    }

    const fields = [
      { autocomplete: 'username', value: username || 'goldspire-secure-text' },
      { autocomplete: 'current-password', value: password },
    ];

    if (url) fields.push({ autocomplete: 'url', value: url });

    const saved = await createItem(extensionId, 'login', {
      title: title || 'Secured secret',
      fields,
      notes: notes || 'Saved from Goldspire Secure Text.',
    });

    return saved
      ? { ok: true }
      : { ok: false, reason: '1Password save was cancelled or is not allowlisted for this extension yet.' };
  }

  async function savePasswordItem({ title, password, notes = '' }) {
    return saveLogin({ title, password, notes, username: '' });
  }

  global.GoldspireOnePassword = {
    ping,
    saveLogin,
    savePasswordItem,
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);
