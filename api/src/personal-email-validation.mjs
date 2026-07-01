import { resolveMx } from 'node:dns/promises';
import { httpError } from './org-service.mjs';
import { billingEnv } from './billing.mjs';

const PERSONAL_EMAIL_RE = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;

const BLOCKED_DOMAINS = new Set([
  'localhost',
  'local',
  'invalid',
  'test',
  'example',
  'example.com',
  'example.org',
  'example.net',
]);

export function personalEmailDomain(email) {
  const at = String(email || '').lastIndexOf('@');
  if (at < 0) return '';
  return email.slice(at + 1).toLowerCase();
}

export function assertPersonalEmailFormat(email) {
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized || !normalized.includes('@')) {
    throw httpError(400, 'A valid email address is required.');
  }
  if (normalized.length > 254 || normalized.length < 5) {
    throw httpError(400, 'Email address looks invalid.');
  }
  if (!PERSONAL_EMAIL_RE.test(normalized)) {
    throw httpError(400, 'Email address format is invalid.');
  }
  const domain = personalEmailDomain(normalized);
  if (!domain || domain.length < 3 || !domain.includes('.')) {
    throw httpError(400, 'Email domain looks invalid.');
  }
  if (BLOCKED_DOMAINS.has(domain) || domain.endsWith('.local') || domain.endsWith('.invalid')) {
    throw httpError(400, 'Use a real email address you can access.');
  }
  const local = normalized.split('@')[0];
  if (local.length < 1 || local.length > 64) {
    throw httpError(400, 'Email address looks invalid.');
  }
  return normalized;
}

export async function assertPersonalEmailDomainResolvable(email, env = billingEnv()) {
  if (String(env.VEIL_PERSONAL_CHECK_MX ?? 'true').toLowerCase() === 'false') return;
  const domain = personalEmailDomain(email);
  if (!domain) throw httpError(400, 'Email domain looks invalid.');
  try {
    const records = await resolveMx(domain);
    if (!Array.isArray(records) || records.length === 0) {
      throw httpError(400, `Email domain "${domain}" does not accept mail. Check for typos.`);
    }
  } catch (error) {
    if (error?.statusCode) throw error;
    throw httpError(400, `Email domain "${domain}" could not be verified. Check for typos.`);
  }
}
