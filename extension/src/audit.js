/**
 * Local metadata-only audit trail (no secrets, no ciphertext).
 */
(function (global) {
  const KEY = 'gstSecurityAudit';
  const MAX = 40;

  async function storageGet(defaults) {
    const gst = global.GoldspireBrowser;
    if (gst?.storageGet) return gst.storageGet('local', defaults);
    return { ...defaults };
  }

  async function log(event) {
    try {
      const gst = global.GoldspireBrowser;
      if (!gst?.storage?.local?.set) return;

      const { [KEY]: existing = [] } = await storageGet({ [KEY]: [] });
      const entry = {
        at: Date.now(),
        action: event.action,
        host: event.host || '',
        mode: event.mode || '',
        profile: event.profile || '',
      };
      await new Promise((resolve) => {
        gst.storage.local.set({ [KEY]: [entry, ...existing].slice(0, MAX) }, resolve);
      });
    } catch {
      // Non-critical.
    }
  }

  global.GoldspireAudit = { log };
})(typeof globalThis !== 'undefined' ? globalThis : self);
