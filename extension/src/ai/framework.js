/**
 * AI site adapter framework — register adapters, match host, init hooks.
 */
(function (global) {
  const adapters = [];

  function register(adapter) {
    if (!adapter?.id || typeof adapter.matches !== 'function') return;
    adapters.push(adapter);
  }

  function getAdapters() {
    return adapters.slice();
  }

  function matchAdapter(loc = location) {
    return adapters.find((adapter) => {
      try {
        return adapter.matches(loc);
      } catch {
        return false;
      }
    }) || null;
  }

  function initAiAdapters({ getSettings, runSafe } = {}) {
    for (const adapter of adapters) {
      try {
        adapter.init?.({ getSettings, runSafe });
      } catch (error) {
        console.warn('[Veil] AI adapter failed:', adapter.id, error);
      }
    }
  }

  function buildAiContext(adapter, partial = {}) {
    return global.GoldspireDetectionContext?.createContext?.({
      host: location.hostname || '',
      source: 'ai_prompt',
      intent: 'ai_prompt',
      isAiSurface: true,
      aiSite: adapter?.id || '',
      ...partial,
    }) || {
      host: location.hostname || '',
      source: 'ai_prompt',
      intent: 'ai_prompt',
      isAiSurface: true,
      aiSite: adapter?.id || '',
      ...partial,
    };
  }

  global.GoldspireAiFramework = {
    register,
    getAdapters,
    matchAdapter,
    initAiAdapters,
    buildAiContext,
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);
