/** Shared learning feature schema + safety (server). */

export const SCHEMA_VERSION = 1;

export const SECRET_CATEGORIES = new Set([
  'api_key', 'jwt', 'password', 'credit_card', 'private_key',
]);

export const MAX_DOWNWARD_ADJUST = 30;
export const MIN_SAMPLES_FOR_SUPPRESS = 12;

export function registrableHost(host = '') {
  const h = String(host || '').toLowerCase().split(':')[0];
  const parts = h.split('.').filter(Boolean);
  if (parts.length <= 2) return h;
  return parts.slice(-2).join('.');
}

export function hashFieldSignature(features = {}) {
  const text = String(features.fieldSigHash || '');
  return text;
}

export function featureIntent(features = {}) {
  return String(features.intent || '').slice(0, 32);
}

export function featureFieldSemantic(features = {}) {
  const sem = features.fieldSemantics;
  if (Array.isArray(sem) && sem.length) return String(sem[0]).slice(0, 32);
  return '';
}

export function canAutoApplyHint(patch = {}, evidence = {}) {
  if (patch.type !== 'learning_hint') return false;
  if (patch.suppress === true) {
    if (SECRET_CATEGORIES.has(String(patch.category || '').toLowerCase())) return false;
    if ((evidence.prompts || 0) < MIN_SAMPLES_FOR_SUPPRESS) return false;
  }
  const adjust = Math.abs(Number(patch.adjustConfidence) || 0);
  if (adjust > MAX_DOWNWARD_ADJUST) return false;
  return !SECRET_CATEGORIES.has(String(patch.category || '').toLowerCase()) || !patch.suppress;
}

export function clampAdjust(value) {
  const n = Number(value) || 0;
  if (n >= 0) return Math.min(15, n);
  return Math.max(-MAX_DOWNWARD_ADJUST, n);
}
