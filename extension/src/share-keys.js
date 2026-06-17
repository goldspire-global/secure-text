/**
 * ECDH P-256 key wrapping for org "Share with" deliveries.
 * Server only stores ciphertext; one-time unlock keys never leave the browser in plaintext.
 */
(function (global) {
  const PRIVATE_KEY_STORAGE = 'gstSharePrivateKeyJwk';

  function bytesToBase64Url(bytes) {
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  }

  function base64UrlToBytes(value) {
    const padded = value.replace(/-/g, '+').replace(/_/g, '/');
    const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
    const binary = atob(padded + pad);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  function browser() {
    return global.GoldspireBrowser;
  }

  async function storageGet(area, defaults) {
    const gst = browser();
    if (gst?.storageGet) return gst.storageGet(area, defaults);
    return { ...defaults };
  }

  async function ensureKeyPair() {
    const stored = await storageGet('local', { [PRIVATE_KEY_STORAGE]: '' });
    if (stored[PRIVATE_KEY_STORAGE]) {
      try {
        const privateJwk = JSON.parse(await global.GoldspireSecrets.decryptFromStorage(stored[PRIVATE_KEY_STORAGE]));
        const publicJwk = { ...privateJwk };
        delete publicJwk.d;
        const privateKey = await crypto.subtle.importKey(
          'jwk',
          privateJwk,
          { name: 'ECDH', namedCurve: 'P-256' },
          false,
          ['deriveKey'],
        );
        return { privateKey, publicJwk };
      } catch {
        // fall through to regenerate
      }
    }

    const keyPair = await crypto.subtle.generateKey(
      { name: 'ECDH', namedCurve: 'P-256' },
      true,
      ['deriveKey'],
    );
    const privateJwk = await crypto.subtle.exportKey('jwk', keyPair.privateKey);
    const publicJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
    const encrypted = await global.GoldspireSecrets.encryptForStorage(JSON.stringify(privateJwk));
    await new Promise((resolve) => {
      browser()?.storage?.local?.set?.({ [PRIVATE_KEY_STORAGE]: encrypted }, resolve);
    });
    return { privateKey: keyPair.privateKey, publicJwk };
  }

  async function getPublicJwk() {
    const { publicJwk } = await ensureKeyPair();
    return publicJwk;
  }

  async function wrapSecretForRecipient(secret, recipientPublicJwk) {
    const ephemeral = await crypto.subtle.generateKey(
      { name: 'ECDH', namedCurve: 'P-256' },
      true,
      ['deriveKey'],
    );
    const recipientPublic = await crypto.subtle.importKey(
      'jwk',
      recipientPublicJwk,
      { name: 'ECDH', namedCurve: 'P-256' },
      false,
      [],
    );
    const aesKey = await crypto.subtle.deriveKey(
      { name: 'ECDH', public: recipientPublic },
      ephemeral.privateKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt'],
    );
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      aesKey,
      new TextEncoder().encode(secret),
    );
    const ephemeralPublicJwk = await crypto.subtle.exportKey('jwk', ephemeral.publicKey);
    return {
      ephemeralPublicJwk,
      iv: bytesToBase64Url(iv),
      ciphertext: bytesToBase64Url(new Uint8Array(ciphertext)),
    };
  }

  async function unwrapSecret(wrapped) {
    const { privateKey } = await ensureKeyPair();
    const ephemeralPublic = await crypto.subtle.importKey(
      'jwk',
      wrapped.ephemeralPublicJwk,
      { name: 'ECDH', namedCurve: 'P-256' },
      false,
      [],
    );
    const aesKey = await crypto.subtle.deriveKey(
      { name: 'ECDH', public: ephemeralPublic },
      privateKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['decrypt'],
    );
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: base64UrlToBytes(wrapped.iv) },
      aesKey,
      base64UrlToBytes(wrapped.ciphertext),
    );
    return new TextDecoder().decode(plaintext);
  }

  async function markerFingerprint(fullMarker) {
    const parsed = global.GoldspireSecureMarker?.parseMarker?.(fullMarker);
    // Hash ciphertext payload only — survives email clients rewriting wrapper/href encoding.
    const stable = parsed?.payload || fullMarker;
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(stable));
    return bytesToBase64Url(new Uint8Array(hash));
  }

  async function markerFingerprints(fullMarker) {
    const parsed = global.GoldspireSecureMarker?.parseMarker?.(fullMarker);
    const payloadFp = await markerFingerprint(fullMarker);
    if (!parsed?.payload) return [payloadFp];
    const fullHash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(fullMarker));
    return [payloadFp, bytesToBase64Url(new Uint8Array(fullHash))];
  }

  global.GoldspireShareKeys = {
    ensureKeyPair,
    getPublicJwk,
    wrapSecretForRecipient,
    unwrapSecret,
    markerFingerprint,
    markerFingerprints,
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);
