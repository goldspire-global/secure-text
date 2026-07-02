/**
 * Veil Gmail add-in — hosted unlock pane (read-only, client-side decrypt).
 */
(function () {
  function bodyFromInjected() {
    if (typeof window.__VEIL_MAIL_BODY__ === 'string') return window.__VEIL_MAIL_BODY__;
    return null;
  }

  function bodyFromHash() {
    const hash = String(location.hash || '').replace(/^#/, '');
    if (!hash.startsWith('body=')) return null;
    try {
      return decodeURIComponent(hash.slice(5));
    } catch {
      return null;
    }
  }

  globalThis.VeilMailUnlock.boot({
    getBody: () => bodyFromInjected() ?? bodyFromHash(),
    replaceBody: null,
  });
})();
