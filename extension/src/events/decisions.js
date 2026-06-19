/**
 * Copilot decision telemetry — pairs prompts with user choices (metadata only).
 */
(function (global) {
  function buildFeatures(context, detections, extra) {
    if (global.GoldspireLearningFeatures?.buildFeatureVector) {
      return global.GoldspireLearningFeatures.buildFeatureVector(context, detections, extra);
    }
    return { intent: context?.intent || 'general', ...extra };
  }

  function topHit(detections = []) {
    return detections[0] || {};
  }

  async function emitDecision(event) {
    if (!global.GoldspireVeilEvents?.emit) return;
    await global.GoldspireVeilEvents.emit(event);
  }

  async function logPrompt({ context, detections, recommended = '' }) {
    const hit = topHit(detections);
    await emitDecision({
      type: 'decision',
      category: hit.category || '',
      severity: hit.severity || '',
      host: context?.host || '',
      source: String(recommended || '').slice(0, 32),
      action: 'prompt',
      confidence: hit.confidence || 0,
      features: buildFeatures(context, detections, { phase: 'prompt', recommended }),
    });
  }

  async function logChoice({ context, detections, recommended = '', choice = '' }) {
    const hit = topHit(detections);
    const normalized = String(choice || 'unknown').slice(0, 32);
    await emitDecision({
      type: 'decision',
      category: hit.category || '',
      severity: hit.severity || '',
      host: context?.host || '',
      source: `rec:${String(recommended || '').slice(0, 24)}`,
      action: normalized,
      confidence: hit.confidence || 0,
      outcome: normalized === String(recommended || '') ? 'agreed' : 'overrode',
      features: buildFeatures(context, detections, { phase: 'choice', recommended, choice: normalized }),
    });
  }

  async function logDismiss({ context, detections, recommended = '' }) {
    const hit = topHit(detections);
    await emitDecision({
      type: 'decision',
      category: hit.category || '',
      severity: hit.severity || '',
      host: context?.host || '',
      source: `rec:${String(recommended || '').slice(0, 24)}`,
      action: 'dismiss',
      confidence: hit.confidence || 0,
      outcome: 'ignored',
      features: buildFeatures(context, detections, { phase: 'dismiss', recommended }),
    });
  }

  global.GoldspireVeilDecisions = {
    logPrompt,
    logChoice,
    logDismiss,
    safeFeatures: buildFeatures,
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);
