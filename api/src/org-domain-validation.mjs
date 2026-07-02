import { resolveMx } from 'node:dns/promises';
import { billingEnv } from './billing.mjs';
import { httpError } from './org-service.mjs';
import { assertPersonalEmailFormat, personalEmailDomain } from './personal-email-validation.mjs';

const BLOCKED_DOMAINS = new Set([
  'localhost',
  'local',
  'invalid',
  'test',
  'example',
  'example.com',
  'example.org',
  'example.net',
  'testcomp.com',
  'gmail.com',
  'googlemail.com',
  'yahoo.com',
  'hotmail.com',
  'outlook.com',
  'icloud.com',
  'proton.me',
  'protonmail.com',
]);

export function normalizeOrgDomain(raw) {
  const domain = String(raw || '').trim().toLowerCase().replace(/^@+/, '');
  if (!domain || domain.length < 3 || !domain.includes('.')) {
    throw httpError(400, 'Email domain looks invalid.');
  }
  if (BLOCKED_DOMAINS.has(domain) || domain.endsWith('.local') || domain.endsWith('.invalid')) {
    throw httpError(400, 'Use your company email domain, not a personal mailbox provider.');
  }
  return domain;
}

export async function assertOrgDomainResolvable(domain, env = billingEnv()) {
  if (String(env.VEIL_ORG_CHECK_MX ?? 'true').toLowerCase() === 'false') return;
  const normalized = normalizeOrgDomain(domain);
  try {
    const records = await resolveMx(normalized);
    if (!Array.isArray(records) || records.length === 0) {
      throw httpError(400, `Domain "${normalized}" does not accept mail. Check for typos.`);
    }
  } catch (error) {
    if (error?.statusCode) throw error;
    throw httpError(400, `Domain "${normalized}" could not be verified. Check for typos.`);
  }
}

export async function verifyOrgDomains(domains = [], env = billingEnv()) {
  const unique = [...new Set(domains.map((d) => normalizeOrgDomain(d)).filter(Boolean))];
  if (!unique.length) {
    return { domains: [], verifiedAt: null, method: null };
  }
  for (const domain of unique) {
    await assertOrgDomainResolvable(domain, env);
  }
  return {
    domains: unique,
    verifiedAt: new Date().toISOString(),
    method: 'mx',
  };
}

/**
 * Resolve allowed member domains for a new org.
 * Explicit domains are MX-verified. When none are supplied, infer from admin email
 * (unless invite-only membership was requested).
 */
export async function resolveOrgAllowedDomains({
  adminEmail = '',
  explicitDomains = [],
  membershipPolicy = '',
  env = billingEnv(),
} = {}) {
  let domains = explicitDomains.map((d) => String(d).trim().toLowerCase().replace(/^@+/, '')).filter(Boolean);
  const policy = String(membershipPolicy || '').toLowerCase();

  if (!domains.length && adminEmail && policy !== 'invite') {
    const formatted = assertPersonalEmailFormat(adminEmail);
    const inferred = personalEmailDomain(formatted);
    if (inferred) domains = [inferred];
  }

  if (!domains.length) {
    return { domains: [], verifiedAt: null, method: null };
  }

  const verified = await verifyOrgDomains(domains, env);
  return {
    ...verified,
    method: !explicitDomains.length && adminEmail ? 'mx_auto' : verified.method,
  };
}
