/**
 * Per-site Veil copilot snooze (extracted from content.js).
 */
(function (global) {
  const STORAGE_KEY = 'gstSnoozedHosts';
  const hosts = new Set();
  let sessionUntil = 0;

  async function load() {
    try {
      const gst = global.GoldspireBrowser;
      if (!gst?.storageGet) return;
      const stored = await gst.storageGet('local', { [STORAGE_KEY]: [] });
      hosts.clear();
      for (const host of stored[STORAGE_KEY] || []) {
        if (host) hosts.add(host);
      }
    } catch {
      // Non-critical.
    }
  }

  function isSnoozed(host = '') {
    const key = String(host || '').trim();
    if (!key) return false;
    if (Date.now() < sessionUntil) return true;
    return hosts.has(key);
  }

  function snoozeSession(ms = 30 * 60 * 1000) {
    sessionUntil = Date.now() + ms;
  }

  async   function snoozeHost(host = '') {
    const key = String(host || '').trim();
    if (!key) return;
    hosts.add(key);
    try {
      const gst = global.GoldspireBrowser;
      if (!gst?.storageGet) return;
      const stored = await gst.storageGet('local', { [STORAGE_KEY]: [] });
      const updated = Array.from(new Set([...(stored[STORAGE_KEY] || []), key]));
      gst.storage?.local?.set?.({ [STORAGE_KEY]: updated });
    } catch {
      // Non-critical.
    }
  }

  const compositionAllowed = [];

  function allowComposition(host, text, match, fieldState) {
    compositionAllowed.push({
      host: String(host || '').trim(),
      matchRaw: String(match?.raw || text || '').trim(),
      fieldSnapshot: String(fieldState?.text || text || ''),
    });
    if (compositionAllowed.length > 24) compositionAllowed.shift();
  }

  function isCompositionAllowed(host, text, match, fieldState) {
    const key = String(host || '').trim();
    const matchRaw = String(match?.raw || text || '').trim();
    const fieldText = String(fieldState?.text || text || '');
    return compositionAllowed.some(
      (entry) => entry.host === key
        && entry.matchRaw === matchRaw
        && entry.fieldSnapshot === fieldText,
    );
  }

  global.GoldspireVeilSnooze = {
    load,
    isSnoozed,
    snoozeSession,
    snoozeHost,
    allowComposition,
    isCompositionAllowed,
    STORAGE_KEY,
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);
