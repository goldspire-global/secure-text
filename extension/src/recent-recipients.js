/**
 * Local recent direct-share recipients (free hinting; Plus uses cloud contacts).
 */
(function (global) {
  const STORAGE_KEY = 'gstRecentRecipients';
  const MAX = 12;

  function storage() {
    return global.GoldspireBrowser?.api?.()?.storage?.local;
  }

  async function load() {
    try {
      const local = storage();
      if (!local?.get) return [];
      const stored = await new Promise((resolve) => local.get(STORAGE_KEY, resolve));
      const list = stored?.[STORAGE_KEY];
      return Array.isArray(list) ? list.filter((e) => typeof e === 'string' && e.includes('@')) : [];
    } catch {
      return [];
    }
  }

  async function remember(email) {
    const normalized = String(email || '').trim().toLowerCase();
    if (!normalized.includes('@')) return;
    const current = await load();
    const next = [normalized, ...current.filter((e) => e !== normalized)].slice(0, MAX);
    try {
      const local = storage();
      if (!local?.set) return;
      await new Promise((resolve) => local.set({ [STORAGE_KEY]: next }, resolve));
    } catch {
      // Non-critical.
    }
  }

  async function rememberMany(emails = []) {
    for (const email of emails) {
      await remember(email);
    }
  }

  global.GoldspireRecentRecipients = {
    load,
    remember,
    rememberMany,
    MAX,
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);
