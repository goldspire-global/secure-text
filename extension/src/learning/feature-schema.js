/**
 * Frozen decision feature schema (v1) — metadata only, no matched text or raw labels.
 */
(function (global) {
  const SCHEMA_VERSION = 1;

  function hashFieldSignature(context = {}) {
    const text = `${context.fieldLabel || ''} ${context.fieldName || ''} ${context.fieldId || ''}`
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
    if (!text) return '';
    let hash = 5381;
    for (let i = 0; i < text.length; i += 1) {
      hash = ((hash << 5) + hash) ^ text.charCodeAt(i);
    }
    return `fs${(hash >>> 0).toString(16).slice(0, 8)}`;
  }

  function registrableHost(host = '') {
    const h = String(host || '').toLowerCase().split(':')[0];
    const parts = h.split('.').filter(Boolean);
    if (parts.length <= 2) return h;
    return parts.slice(-2).join('.');
  }

  function buildFeatureVector(context = {}, detections = [], extra = {}) {
    const sem = context.fieldSemantics?.semantics || [];
    const categories = (detections || [])
      .slice(0, 6)
      .map((hit) => String(hit.category || '').slice(0, 32))
      .filter(Boolean);
    const top = detections[0] || {};

    return {
      schemaVersion: SCHEMA_VERSION,
      intent: String(context.intent || 'general').slice(0, 32),
      source: String(context.source || '').slice(0, 24),
      editorKind: String(context.editorKind || '').slice(0, 16),
      host: String(context.host || '').slice(0, 253),
      registrableHost: registrableHost(context.host),
      fieldSemantics: sem.slice(0, 5).map((id) => String(id).slice(0, 32)),
      fieldSigHash: hashFieldSignature(context),
      detectionCount: Math.min(10, (detections || []).length),
      categories,
      topCategory: String(top.category || '').slice(0, 32),
      topConfidence: Math.min(100, Math.max(0, Math.round(Number(top.confidence) || 0))),
      topSeverity: String(top.severity || '').slice(0, 16),
      ...extra,
    };
  }

  global.GoldspireLearningFeatures = {
    SCHEMA_VERSION,
    buildFeatureVector,
    hashFieldSignature,
    registrableHost,
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);
