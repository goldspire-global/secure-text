/**
 * Personal weekly activity summary — local only, shown in popup Home.
 */
(function (global) {
  const STATS_KEY = 'gstWeeklyActivity';
  const SHOWN_KEY = 'gstWeeklyDigestShown';

  function weekKey(date = new Date()) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - d.getDay());
    return d.toISOString().slice(0, 10);
  }

  function emptyStats() {
    return {
      week: weekKey(),
      secured: 0,
      masked: 0,
      copilot: 0,
      aiSanitized: 0,
      tokenized: 0,
    };
  }

  async function readStats() {
    try {
      const gst = global.GoldspireBrowser;
      if (!gst?.storageGet) return emptyStats();
      const stored = await gst.storageGet('local', { [STATS_KEY]: null });
      const stats = stored[STATS_KEY];
      const current = weekKey();
      if (!stats || stats.week !== current) return emptyStats();
      return { ...emptyStats(), ...stats, week: current };
    } catch {
      return emptyStats();
    }
  }

  async function saveStats(stats) {
    try {
      global.GoldspireBrowser?.storage?.local?.set?.({ [STATS_KEY]: stats });
    } catch {
      // Non-critical.
    }
  }

  async function record(action) {
    const stats = await readStats();
    if (action === 'secure' || action === 'encrypt') stats.secured += 1;
    else if (action === 'mask') stats.masked += 1;
    else if (action === 'copilot') stats.copilot += 1;
    else if (action === 'ai') stats.aiSanitized += 1;
    else if (action === 'tokenize') stats.tokenized += 1;
    await saveStats(stats);
    return stats;
  }

  function totalProtected(stats) {
    return (stats.secured || 0) + (stats.masked || 0) + (stats.tokenized || 0)
      + (stats.copilot || 0) + (stats.aiSanitized || 0);
  }

  async function buildSummaryLine() {
    const stats = await readStats();
    const total = totalProtected(stats);
    if (total === 0) return '';
    const parts = [];
    if (stats.secured) parts.push(`${stats.secured} secured`);
    if (stats.masked) parts.push(`${stats.masked} masked`);
    if (stats.tokenized) parts.push(`${stats.tokenized} tokenized`);
    if (stats.copilot) parts.push(`${stats.copilot} copilot`);
    if (stats.aiSanitized) parts.push(`${stats.aiSanitized} AI sanitized`);
    return `This week: ${parts.join(' · ')}.`;
  }

  async function buildHeroStats() {
    const stats = await readStats();
    const total = totalProtected(stats);
    if (total === 0) return null;
    return {
      total,
      secured: stats.secured || 0,
      masked: stats.masked || 0,
      tokenized: stats.tokenized || 0,
      copilot: stats.copilot || 0,
      aiSanitized: stats.aiSanitized || 0,
    };
  }

  async function shouldShowInPopup() {
    try {
      const gst = global.GoldspireBrowser;
      if (!gst?.storageGet) return false;
      const stored = await gst.storageGet('local', { [STATS_KEY]: null, [SHOWN_KEY]: '' });
      const stats = stored[STATS_KEY];
      const current = weekKey();
      if (!stats || stats.week !== current) return false;
      if (stored[SHOWN_KEY] === current) return false;
      return totalProtected(stats) > 0;
    } catch {
      return false;
    }
  }

  async function markShown() {
    try {
      global.GoldspireBrowser?.storage?.local?.set?.({ [SHOWN_KEY]: weekKey() });
    } catch {
      // Non-critical.
    }
  }

  global.GoldspireWeeklyDigest = {
    record,
    buildSummaryLine,
    buildHeroStats,
    shouldShowInPopup,
    markShown,
    totalProtected,
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);
