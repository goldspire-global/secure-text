/**
 * Veil security event bus — metadata only, never stores matched content.
 * Sprint 3+ emits detection/policy events. Inactive when copilot/DLP flags are off.
 */
(function (global) {
  const STORAGE_KEY = 'gstVeilEvents';
  const MAX_LOCAL = 200;

  function isEnabled(settings) {
    if (!settings) return false;
    if (settings.copilotEnabled === true) return true;
    if (settings.productAnalytics !== false && settings.orgId) return true;
    const mode = String(settings.dlpMode || 'off').toLowerCase();
    return mode === 'observe' || mode === 'enforce';
  }

  function sanitizeEntry(event = {}) {
    return {
      at: Date.now(),
      type: String(event.type || 'unknown'),
      category: String(event.category || ''),
      severity: String(event.severity || ''),
      host: String(event.host || '').slice(0, 253),
      source: String(event.source || ''),
      action: String(event.action || ''),
      confidence: Number(event.confidence) || 0,
      outcome: String(event.outcome || '').slice(0, 32),
    };
  }

  async function storageGet(defaults) {
    const gst = global.GoldspireBrowser;
    if (gst?.storageGet) return gst.storageGet('local', defaults);
    return { ...defaults };
  }

  async function emit(event) {
    try {
      if (!global.GoldspireSettings?.load) return;
      const settings = await global.GoldspireSettings.load();
      if (!isEnabled(settings)) return;

      const gst = global.GoldspireBrowser;
      if (!gst?.storage?.local?.set) return;

      const entry = sanitizeEntry(event);
      const { [STORAGE_KEY]: existing = [] } = await storageGet({ [STORAGE_KEY]: [] });
      const list = Array.isArray(existing) ? existing : [];

      await new Promise((resolve) => {
        gst.storage.local.set({ [STORAGE_KEY]: [entry, ...list].slice(0, MAX_LOCAL) }, resolve);
      });
    } catch {
      // Non-critical.
    }
  }

  async function readRecent(limit = 20) {
    try {
      const { [STORAGE_KEY]: existing = [] } = await storageGet({ [STORAGE_KEY]: [] });
      const list = Array.isArray(existing) ? existing : [];
      return list.slice(0, Math.max(1, limit));
    } catch {
      return [];
    }
  }

  global.GoldspireVeilEvents = {
    emit,
    readRecent,
    isEnabled,
    sanitizeEntry,
    STORAGE_KEY,
    MAX_LOCAL,
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);
