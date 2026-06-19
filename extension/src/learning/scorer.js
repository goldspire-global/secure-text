/**
 * On-device interrupt-risk scorer — inference only (weights from signed learning bundle).
 */
(function (global) {
  function sigmoid(x) {
    if (x >= 0) {
      const z = Math.exp(-x);
      return 1 / (1 + z);
    }
    const z = Math.exp(x);
    return z / (1 + z);
  }

  function intentWeight(weights, intent) {
    if (!weights || !intent) return 0;
    const key = `intent_${String(intent).replace(/[^a-z0-9_]/gi, '_')}`;
    return Number(weights[key]) || 0;
  }

  function semanticWeight(weights, semantics = []) {
    if (!weights || !semantics.length) return 0;
    let total = 0;
    for (const id of semantics.slice(0, 3)) {
      const key = `sem_${String(id).replace(/[^a-z0-9_]/gi, '_')}`;
      total += Number(weights[key]) || 0;
    }
    return total;
  }

  function scoreInterruptRisk(featureVector = {}, scorer = {}) {
    const weights = scorer.weights || {};
    let logit = Number(weights.bias) || 0;
    logit += (Number(featureVector.topConfidence) || 0) * (Number(weights.confidence) || 0);
    logit += intentWeight(weights, featureVector.intent);
    logit += semanticWeight(weights, featureVector.fieldSemantics);
    if (featureVector.registrableHost && weights.host_match) {
      const host = String(featureVector.registrableHost || '');
      const pattern = String(scorer.hostPattern || '').toLowerCase();
      if (pattern && (host === pattern || host.endsWith(`.${pattern}`))) {
        logit += Number(weights.host_match) || 0;
      }
    }
    return sigmoid(logit);
  }

  function applyScorers(text, detections = [], context = {}, settings = {}) {
    const bundle = settings.learningBundle;
    const scorers = Array.isArray(bundle?.scorers) ? bundle.scorers : [];
    if (!scorers.length || !detections.length) return detections;

    const features = global.GoldspireLearningFeatures?.buildFeatureVector?.(
      context,
      detections,
      { phase: 'score' },
    ) || {};

    let out = detections.map((hit) => ({ ...hit }));

    for (const scorer of scorers) {
      if (scorer.category && scorer.category !== features.topCategory) continue;
      const risk = scoreInterruptRisk(features, scorer);
      const threshold = Number(scorer.threshold) || 0.55;
      if (risk < threshold) continue;

      const safety = global.GoldspireLearningSafety;
      out = out.map((hit) => {
        if (scorer.category && hit.category !== scorer.category) return hit;
        if (scorer.action === 'suppress') {
          if (safety?.isSecretCategory?.(hit.category)) return hit;
          return { ...hit, suppressedByLearning: true, confidence: 0, learningRisk: risk };
        }
        const adjust = safety?.clampAdjust?.(scorer.adjust) ?? (Number(scorer.adjust) || -15);
        const next = Math.max(0, Math.min(100, (Number(hit.confidence) || 0) + adjust));
        return { ...hit, confidence: next, learningAdjusted: true, learningRisk: risk, learningDelta: adjust };
      }).filter((hit) => !hit.suppressedByLearning && (Number(hit.confidence) || 0) > 0);
    }

    return out;
  }

  global.GoldspireLearningScorer = {
    scoreInterruptRisk,
    applyScorers,
    sigmoid,
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);
