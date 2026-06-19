/**
 * Learning safety rails — secrets cannot be auto-suppressed without ops review.
 */
(function (global) {
  const SECRET_CATEGORIES = new Set([
    'api_key', 'jwt', 'password', 'credit_card', 'private_key',
  ]);

  const MAX_DOWNWARD_ADJUST = 30;
  const MIN_SAMPLES_FOR_SUPPRESS = 12;

  function isSecretCategory(category) {
    return SECRET_CATEGORIES.has(String(category || '').toLowerCase());
  }

  function canAutoApplyHint(patch = {}, evidence = {}) {
    if (patch.type !== 'learning_hint') return { ok: false, reason: 'not_hint' };
    if (patch.suppress === true) {
      if (isSecretCategory(patch.category)) return { ok: false, reason: 'secret_suppress' };
      if ((evidence.prompts || 0) < MIN_SAMPLES_FOR_SUPPRESS) return { ok: false, reason: 'low_samples' };
    }
    const adjust = Math.abs(Number(patch.adjustConfidence) || 0);
    if (adjust > MAX_DOWNWARD_ADJUST) return { ok: false, reason: 'adjust_too_large' };
    if (isSecretCategory(patch.category) && patch.suppress) {
      return { ok: false, reason: 'secret_suppress' };
    }
    return { ok: true };
  }

  function clampAdjust(value) {
    const n = Number(value) || 0;
    if (n >= 0) return Math.min(15, n);
    return Math.max(-MAX_DOWNWARD_ADJUST, n);
  }

  function allowSuppress(category, sampleCount = 0) {
    if (isSecretCategory(category)) return false;
    return sampleCount >= MIN_SAMPLES_FOR_SUPPRESS;
  }

  global.GoldspireLearningSafety = {
    SECRET_CATEGORIES,
    MAX_DOWNWARD_ADJUST,
    isSecretCategory,
    canAutoApplyHint,
    clampAdjust,
    allowSuppress,
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);
