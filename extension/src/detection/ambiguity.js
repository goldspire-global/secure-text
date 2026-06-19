/**
 * Apply signed learning bundle — hints, scorers, safety rails (inference only).
 */
(function (global) {
  function hostMatches(pattern, host) {
    const p = String(pattern || '').trim().toLowerCase();
    const h = String(host || '').trim().toLowerCase();
    if (!p || p === '*') return true;
    if (!h) return false;
    if (p.startsWith('*.')) return h.endsWith(p.slice(1)) || h === p.slice(2);
    return h === p || h.endsWith(`.${p}`) || h.includes(p);
  }

  function mergedSettings(settings = {}) {
    const bundle = settings.learningBundle && typeof settings.learningBundle === 'object'
      ? settings.learningBundle
      : {};
    const hints = [
      ...(Array.isArray(settings.learningHints) ? settings.learningHints : []),
      ...(Array.isArray(bundle.hints) ? bundle.hints : []),
    ];
    return { ...settings, learningHints: hints, learningBundle: bundle };
  }

  function semanticMatch(hint, context = {}) {
    const want = String(hint.fieldSemantic || '').trim();
    if (!want) return true;
    const sem = context.fieldSemantics?.semantics || [];
    return sem.includes(want);
  }

  function intentMatch(hint, context = {}) {
    const want = String(hint.intent || '').trim();
    if (!want) return true;
    return String(context.intent || '') === want;
  }

  function applyLearningHints(text, detections = [], context = {}, settings = {}) {
    const merged = mergedSettings(settings);
    const list = merged.learningHints.filter((hint) => hint && hint.active !== false);
    if (!list.length || !detections.length) return detections;

    const safety = global.GoldspireLearningSafety;
    const host = context.host || '';
    let out = detections.map((hit) => ({ ...hit }));

    for (const hint of list) {
      if (!hostMatches(hint.hostPattern, host)) continue;

      out = out
        .map((hit) => {
          if (hint.category && hit.category !== hint.category) return hit;
          if (!semanticMatch(hint, context)) return hit;
          if (!intentMatch(hint, context)) return hit;

          if (hint.suppress) {
            if (safety?.isSecretCategory?.(hit.category)) return hit;
            if (!safety?.allowSuppress?.(hit.category, hint.evidence?.samples)) return hit;
            return { ...hit, suppressedByLearning: true, confidence: 0 };
          }

          const adjust = safety?.clampAdjust?.(hint.adjustConfidence) ?? (Number(hint.adjustConfidence) || 0);
          if (!adjust) return hit;
          const next = Math.max(0, Math.min(100, (Number(hit.confidence) || 0) + adjust));
          return {
            ...hit,
            confidence: next,
            learningAdjusted: true,
            learningDelta: adjust,
          };
        })
        .filter((hit) => !hit.suppressedByLearning && (Number(hit.confidence) || 0) > 0);
    }

    out = global.GoldspireLearningScorer?.applyScorers?.(text, out, context, merged) || out;
    return out;
  }

  global.GoldspireDetectionAmbiguity = {
    applyLearningHints,
    hostMatches,
    mergedSettings,
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);
