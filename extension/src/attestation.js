/**
 * Client-side encryption attestation — proves secure actions ran locally (metadata only).
 */
(function (global) {
  const STORAGE_KEY = 'gstLastAttestation';

  async function digestCiphertext(ciphertext) {
    const bytes = new TextEncoder().encode(String(ciphertext || '').slice(0, 512));
    const hash = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(hash))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
      .slice(0, 16);
  }

  async function record({ ciphertext, mode = 'team', profile = 'personal', alg = 'AES-256-GCM' } = {}) {
    if (!ciphertext) return null;
    const fingerprint = await digestCiphertext(ciphertext);
    const entry = {
      at: Date.now(),
      mode,
      profile,
      alg,
      kdf: 'PBKDF2',
      iterations: global.GoldspireSecureCrypto?.getIterations?.(profile) || 600_000,
      fingerprint,
      clientOnly: true,
    };
    try {
      await global.chrome?.storage?.local?.set?.({ [STORAGE_KEY]: entry });
    } catch {
      // Non-critical.
    }
    return entry;
  }

  async function load() {
    try {
      const stored = await global.chrome?.storage?.local?.get?.(STORAGE_KEY);
      return stored?.[STORAGE_KEY] || null;
    } catch {
      return null;
    }
  }

  function formatRelative(at) {
    if (!at) return '';
    const mins = Math.round((Date.now() - at) / 60_000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.round(mins / 60);
    if (hours < 48) return `${hours}h ago`;
    return `${Math.round(hours / 24)}d ago`;
  }

  function summaryLine(entry) {
    if (!entry?.fingerprint) return '';
    return `Last secure ${formatRelative(entry.at)} · ${entry.alg} · proof ${entry.fingerprint}`;
  }

  global.GoldspireAttestation = {
    STORAGE_KEY,
    record,
    load,
    summaryLine,
    formatRelative,
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);
