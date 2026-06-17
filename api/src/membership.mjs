import { httpError } from './org-service.mjs';
import { normalizeEmail } from './auth.mjs';

export const MEMBERSHIP_POLICIES = new Set(['open', 'invite', 'domain']);

export function parseMembershipSettings(settings = {}) {
  const policy = String(settings.membershipPolicy || 'invite').toLowerCase();
  const membershipPolicy = MEMBERSHIP_POLICIES.has(policy) ? policy : 'invite';
  const allowedEmailDomains = Array.isArray(settings.allowedEmailDomains)
    ? settings.allowedEmailDomains.map((d) => String(d).trim().toLowerCase()).filter(Boolean)
    : [];
  return { membershipPolicy, allowedEmailDomains };
}

export function emailDomain(email) {
  const at = String(email || '').lastIndexOf('@');
  if (at < 0) return '';
  return email.slice(at + 1).toLowerCase();
}

export async function assertMemberEmailAllowed(pool, orgId, email, deviceId, settings = {}) {
  const { membershipPolicy, allowedEmailDomains } = parseMembershipSettings(settings);

  if (membershipPolicy === 'open') return;

  if (membershipPolicy === 'domain') {
    const domain = emailDomain(email);
    if (!domain || !allowedEmailDomains.includes(domain)) {
      throw httpError(
        403,
        `Only work emails from ${allowedEmailDomains.join(', ')} can join this organization.`,
      );
    }
    return;
  }

  // invite — email must be pre-added by admin
  const result = await pool.query(
    `SELECT device_id
     FROM org_members
     WHERE org_id = $1 AND email = $2 AND active = true`,
    [orgId, email],
  );

  if (result.rowCount === 0) {
    throw httpError(
      403,
      'This email is not on the member list. Ask your admin to add you in the admin console.',
    );
  }

  const existingDevice = result.rows[0].device_id;
  if (existingDevice && existingDevice !== deviceId) {
    throw httpError(403, 'This email is already registered on another device.');
  }
}

export async function loadOrgSettings(pool, orgId) {
  const result = await pool.query(
    `SELECT settings FROM organizations WHERE id = $1`,
    [orgId],
  );
  if (result.rowCount === 0) throw httpError(404, 'Organization not found.');
  return typeof result.rows[0].settings === 'object' && result.rows[0].settings
    ? result.rows[0].settings
    : {};
}
