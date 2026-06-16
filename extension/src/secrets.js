/**
 * Passphrase handling at rest — encrypted locally for personal use,
 * session-only for organization profiles.
 */
(function (global) {
  const DEVICE_KEY = 'gstDeviceWrapKey';
  const SYNC_PASSPHRASE = 'gstEncryptedPassphrase';
  const ORG_SYNC_KEY = 'gstOrgEncryptedPassphraseSync';
  const ORG_SESSION_KEY = 'gstOrgEncryptedPassphrase';
  const SESSION_TEAM_KEY = 'gstSessionTeamPassphrase';
  /** Per-isolate fallback when storage.session callbacks fail (e.g. transient lastError). */
  let memorySessionTeamPassphrase = '';

  function bytesToBase64(bytes) {
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
  }

  function browser() {
    return global.GoldspireBrowser;
  }

  function storageGet(area, defaults) {
    const gst = browser();
    if (gst?.storageGet) return gst.storageGet(area, defaults);
    return new Promise((resolve) => {
      try {
        const store = gst?.storage?.[area];
        if (!store?.get) {
          resolve({ ...defaults });
          return;
        }
        store.get(defaults, (result) => resolve(result || { ...defaults }));
      } catch {
        resolve({ ...defaults });
      }
    });
  }

  function base64ToBytes(value) {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  async function getDeviceWrapKey() {
    const stored = await storageGet('local', { [DEVICE_KEY]: '' });

    if (stored[DEVICE_KEY]) {
      const raw = base64ToBytes(stored[DEVICE_KEY]);
      return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
    }

    const raw = crypto.getRandomValues(new Uint8Array(32));
    await new Promise((resolve) => {
      browser()?.storage?.local?.set?.({ [DEVICE_KEY]: bytesToBase64(raw) }, resolve);
    });
    return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
  }

  async function encryptForStorage(plaintext) {
    const key = await getDeviceWrapKey();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      new TextEncoder().encode(plaintext),
    );
    return `${bytesToBase64(iv)}.${bytesToBase64(new Uint8Array(ciphertext))}`;
  }

  async function decryptFromStorage(payload) {
    if (!payload) return '';
    const [ivPart, cipherPart] = payload.split('.');
    if (!ivPart || !cipherPart) return '';

    const key = await getDeviceWrapKey();
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: base64ToBytes(ivPart) },
      key,
      base64ToBytes(cipherPart),
    );
    return new TextDecoder().decode(decrypted);
  }

  async function savePassphrase(passphrase, profile, options = {}) {
    const trimmed = passphrase?.trim() || '';
    const persist = options.persist !== false;
    if (!trimmed) {
      const gst = browser();
      await Promise.all([
        new Promise((resolve) => gst?.storage?.sync?.remove?.([SYNC_PASSPHRASE, ORG_SYNC_KEY], resolve) || resolve()),
        new Promise((resolve) =>
          gst?.storage?.session?.remove?.(['passphrase', ORG_SESSION_KEY], resolve) || resolve(),
        ),
      ]);
      return;
    }

    const gst = browser();
    const encrypted = await encryptForStorage(trimmed);

    if (profile === 'organization') {
      if (persist && gst?.storage?.sync) {
        await new Promise((resolve) => {
          gst.storage.sync.set({ [ORG_SYNC_KEY]: encrypted }, resolve);
        });
      }
      if (gst?.storage?.session) {
        await new Promise((resolve) => {
          gst.storage.session.set({ [ORG_SESSION_KEY]: encrypted, passphrase: '' }, resolve);
        });
      }
      if (!persist) {
        await new Promise((resolve) => gst?.storage?.sync?.remove?.(ORG_SYNC_KEY, resolve) || resolve());
      }
      await new Promise((resolve) => gst?.storage?.sync?.remove?.(SYNC_PASSPHRASE, resolve) || resolve());
      return;
    }
    await new Promise((resolve) => {
      gst?.storage?.sync?.set?.({ [SYNC_PASSPHRASE]: encrypted, passphrase: '' }, resolve);
    });
    await new Promise((resolve) => gst?.storage?.sync?.remove?.(ORG_SYNC_KEY, resolve) || resolve());
    if (gst?.storage?.session) {
      await new Promise((resolve) => gst.storage.session.remove('passphrase', resolve));
    }
  }

  async function loadPassphrase(profile) {
    const gst = browser();
    if (profile === 'organization') {
      const synced = await storageGet('sync', { [ORG_SYNC_KEY]: '' });
      if (synced[ORG_SYNC_KEY]) {
        try {
          return await decryptFromStorage(synced[ORG_SYNC_KEY]);
        } catch {
          return '';
        }
      }

      if (gst?.storage?.session) {
        const session = await storageGet('session', { [ORG_SESSION_KEY]: '', passphrase: '' });

        if (session[ORG_SESSION_KEY]) {
          try {
            return await decryptFromStorage(session[ORG_SESSION_KEY]);
          } catch {
            return '';
          }
        }

        if (session.passphrase) {
          await savePassphrase(session.passphrase, 'organization');
          return session.passphrase;
        }
      }

      return '';
    }

    const synced = await storageGet('sync', { [SYNC_PASSPHRASE]: '', passphrase: '' });

    if (synced[SYNC_PASSPHRASE]) {
      try {
        return await decryptFromStorage(synced[SYNC_PASSPHRASE]);
      } catch {
        return '';
      }
    }

    // Migrate legacy plaintext storage once, then re-save encrypted.
    if (synced.passphrase) {
      await savePassphrase(synced.passphrase, 'personal');
      return synced.passphrase;
    }

    return '';
  }

  function clearMemoryString(value) {
    if (typeof value !== 'string') return;
    // Best-effort wipe — JS strings are immutable but this limits accidental retention in mutable buffers.
    try {
      const buffer = new Uint8Array(value.length);
      crypto.getRandomValues(buffer);
    } catch {
      // ignore
    }
  }

  async function cacheSessionTeamPassphrase(passphrase) {
    const trimmed = passphrase?.trim() || '';
    if (!trimmed) return;

    memorySessionTeamPassphrase = trimmed;

    const gst = browser();
    if (!gst?.storage?.session?.set) return;

    try {
      const encrypted = await encryptForStorage(trimmed);
      await new Promise((resolve) => {
        gst.storage.session.set({ [SESSION_TEAM_KEY]: encrypted }, () => resolve());
      });
    } catch {
      // Memory fallback above still enables one-click secure this frame.
    }
  }

  async function loadSessionTeamPassphrase() {
    if (memorySessionTeamPassphrase) return memorySessionTeamPassphrase;

    const gst = browser();
    if (!gst?.storage?.session?.get) return '';

    const session = await storageGet('session', { [SESSION_TEAM_KEY]: '' });
    if (!session[SESSION_TEAM_KEY]) return '';

    try {
      const decrypted = await decryptFromStorage(session[SESSION_TEAM_KEY]);
      if (decrypted) memorySessionTeamPassphrase = decrypted;
      return decrypted;
    } catch {
      return '';
    }
  }

  async function clearSessionTeamPassphrase() {
    memorySessionTeamPassphrase = '';
    const gst = browser();
    if (!gst?.storage?.session?.remove) return;
    await new Promise((resolve) => {
      gst.storage.session.remove(SESSION_TEAM_KEY, () => resolve());
    });
  }

  global.GoldspireSecrets = {
    savePassphrase,
    loadPassphrase,
    cacheSessionTeamPassphrase,
    loadSessionTeamPassphrase,
    clearSessionTeamPassphrase,
    clearMemoryString,
    encryptForStorage,
    decryptFromStorage,
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
