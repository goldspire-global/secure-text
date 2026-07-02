/**
 * Unified Allow memory — session snooze, field allow, and per-site rules (local).
 */
(function (global) {
  const SITE_ALLOW_RULES_KEY = 'gstSiteAllowRules';
  let siteAllowRules = [];

  function isSecretCategory(category) {
    return global.GoldspireLearningSafety?.isSecretCategory?.(category) === true;
  }

  function ruleKey(rule = {}) {
    return `${rule.host || ''}:${rule.category || ''}:${rule.intent || '*'}`;
  }

  async function loadSiteAllowRules() {
    try {
      const gst = global.GoldspireBrowser;
      if (!gst?.storageGet) return siteAllowRules;
      const stored = await gst.storageGet('local', { [SITE_ALLOW_RULES_KEY]: [] });
      siteAllowRules = Array.isArray(stored[SITE_ALLOW_RULES_KEY]) ? stored[SITE_ALLOW_RULES_KEY] : [];
      return siteAllowRules;
    } catch {
      return siteAllowRules;
    }
  }

  async function saveSiteAllowRules(rules) {
    siteAllowRules = rules.slice(-64);
    try {
      const gst = global.GoldspireBrowser;
      gst?.storage?.local?.set?.({ [SITE_ALLOW_RULES_KEY]: siteAllowRules });
      if (global.GoldspireProfileSync?.scheduleCopilotMemoryPush) {
        global.GoldspireProfileSync.scheduleCopilotMemoryPush();
      } else {
        gst?.sendMessage?.({ type: 'PROFILE_SYNC_PUSH_COPILOT_MEMORY' })?.catch?.(() => {});
      }
    } catch {
      // Non-critical.
    }
  }

  function isSiteAllowRule(host = '', context = {}, category = '') {
    const key = String(host || '').trim();
    const cat = String(category || '').trim();
    const intent = String(context.intent || '').trim();
    if (!key || !cat) return false;
    return siteAllowRules.some((rule) => {
      if (rule.host !== key || rule.category !== cat) return false;
      const want = String(rule.intent || '*').trim();
      return want === '*' || !want || want === intent;
    });
  }

  function canRememberSiteAllow(detections = []) {
    return (detections || []).some((hit) => hit?.category && !isSecretCategory(hit.category));
  }

  function filterPromptableDetections(detections = [], host = '', context = {}) {
    return (detections || []).filter((hit) => {
      const cat = hit?.category;
      if (!cat) return false;
      if (global.GoldspireVeilSnooze?.isCategorySnoozed?.(host, cat)) return false;
      if (isSiteAllowRule(host, context, cat)) return false;
      return true;
    });
  }

  async function rememberSiteAllows(host, context = {}, detections = []) {
    const key = String(host || '').trim();
    const categories = [];
    if (!key) return { host: key, intent: '*', categories };
    await loadSiteAllowRules();
    const intent = String(context.intent || '*').trim() || '*';
    let changed = false;
    for (const hit of detections || []) {
      const cat = hit?.category;
      if (!cat || isSecretCategory(cat)) continue;
      const next = { host: key, category: cat, intent, createdAt: Date.now() };
      if (!siteAllowRules.some((rule) => ruleKey(rule) === ruleKey(next))) {
        siteAllowRules.push(next);
        categories.push(cat);
        changed = true;
      }
    }
    if (changed) await saveSiteAllowRules(siteAllowRules);
    return { host: key, intent, categories };
  }

  function formatCategoryList(categories = []) {
    return [...new Set(categories)].map((c) => String(c).replace(/_/g, ' ')).join(', ');
  }

  function showSiteAllowUndoToast(payload = {}) {
    const { host, intent, categories } = payload;
    if (!host || !categories?.length) return;
    const label = formatCategoryList(categories);
    global.GoldspireSecureUI?.showActionToast?.({
      message: `Won't prompt for ${label} on ${host}`,
      type: 'info',
      durationMs: 5000,
      actionLabel: 'Undo',
      onAction: async () => {
        for (const cat of categories) {
          await removeSiteAllowRule(host, cat, intent);
        }
        global.GoldspireSecureUI?.showToast?.('Site allow rule removed.', 'info');
      },
    });
  }

  async function recordAllow({
    host = '',
    text = '',
    match = null,
    fieldState = null,
    detections = [],
    context = {},
    scope = 'session',
  } = {}) {
    global.GoldspireVeilSnooze?.allowComposition?.(
      host,
      text,
      match,
      fieldState,
      detections,
    );
    if (scope === 'site') {
      const saved = await rememberSiteAllows(host, context, detections);
      showSiteAllowUndoToast(saved);
      void global.GoldspireVeilDecisions?.logChoice?.({
        context,
        detections,
        recommended: 'ignore',
        choice: 'ignore_site',
      });
      return { scope: 'site', ...saved };
    }
    return { scope: 'session' };
  }

  async function removeSiteAllowRule(host, category, intent = '*') {
    await loadSiteAllowRules();
    const key = ruleKey({ host, category, intent });
    const next = siteAllowRules.filter((rule) => ruleKey(rule) !== key);
    if (next.length !== siteAllowRules.length) {
      await saveSiteAllowRules(next);
    }
  }

  async function clearSiteAllowRules() {
    await saveSiteAllowRules([]);
  }

  function listSiteAllowRules() {
    return siteAllowRules.slice();
  }

  global.GoldspireVeilAllowMemory = {
    SITE_ALLOW_RULES_KEY,
    loadSiteAllowRules,
    isSiteAllowRule,
    canRememberSiteAllow,
    filterPromptableDetections,
    recordAllow,
    removeSiteAllowRule,
    clearSiteAllowRules,
    listSiteAllowRules,
    showSiteAllowUndoToast,
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);
