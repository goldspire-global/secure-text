import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { getPool } from './db.mjs';
import { httpError } from './org-service.mjs';
import { deactivateOrgMemberDevices } from './member-devices.mjs';
import { addOrgMember } from './admin-service.mjs';

const SCIM_PREFIX = '/scim/v2';

function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

function safeEqual(a, b) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export function generateScimToken() {
  return `veil_scim_${randomBytes(24).toString('base64url')}`;
}

export async function rotateScimToken(admin, env = {}) {
  const token = generateScimToken();
  const tokenHash = hashToken(token);
  const pool = getPool();
  const settings = { ...(admin.org.settings || {}) };
  settings.scim = {
    enabled: true,
    tokenHash,
    rotatedAt: new Date().toISOString(),
  };
  await pool.query(
    `UPDATE organizations SET settings = $2, updated_at = now() WHERE id = $1`,
    [admin.org.id, JSON.stringify(settings)],
  );
  const base = String(env.ORG_API_BASE || env.API_PUBLIC_URL || '').replace(/\/$/, '');
  return {
    ok: true,
    token,
    endpoint: `${base}${SCIM_PREFIX}/Users`,
    note: 'Store this token securely. It is shown once.',
  };
}

export async function authenticateScim(req) {
  const auth = String(req.headers.authorization || '');
  const match = auth.match(/^Bearer\s+(.+)$/i);
  if (!match) throw httpError(401, 'SCIM bearer token required.');

  const token = match[1].trim();
  const tokenHash = hashToken(token);
  const pool = getPool();
  const result = await pool.query(
    `SELECT id, display_name, settings FROM organizations WHERE active = true`,
  );

  for (const row of result.rows) {
    const scim = row.settings?.scim;
    if (!scim?.enabled || !scim?.tokenHash) continue;
    if (safeEqual(tokenHash, scim.tokenHash)) {
      return { org: { id: row.id, display_name: row.display_name, settings: row.settings } };
    }
  }
  throw httpError(401, 'Invalid SCIM token.');
}

function scimUserResource(member) {
  const active = member.active !== false;
  return {
    schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
    id: member.email,
    userName: member.email,
    name: { formatted: member.display_name || member.email },
    emails: [{ value: member.email, primary: true }],
    active,
    meta: { resourceType: 'User' },
  };
}

export async function scimListUsers(scimAuth, query = {}) {
  const pool = getPool();
  const result = await pool.query(
    `SELECT email, display_name, active FROM org_members WHERE org_id = $1 ORDER BY email`,
    [scimAuth.org.id],
  );
  const start = Math.max(1, Number(query.startIndex) || 1);
  const count = Math.min(200, Math.max(1, Number(query.count) || 100));
  const slice = result.rows.slice(start - 1, start - 1 + count);
  return {
    schemas: ['urn:ietf:params:scim:api:messages:2.0:ListResponse'],
    totalResults: result.rows.length,
    startIndex: start,
    itemsPerPage: slice.length,
    Resources: slice.map(scimUserResource),
  };
}

export async function scimCreateUser(scimAuth, body = {}) {
  const email = String(body.userName || body.emails?.[0]?.value || '').trim().toLowerCase();
  if (!email) throw httpError(400, 'userName required.');

  const admin = { org: scimAuth.org };
  await addOrgMember(admin, {
    email,
    displayName: body.name?.formatted || body.displayName || '',
  });

  const pool = getPool();
  const row = await pool.query(
    `SELECT email, display_name, active FROM org_members WHERE org_id = $1 AND email = $2`,
    [scimAuth.org.id, email],
  );

  return scimUserResource(row.rows[0]);
}

export async function scimPatchUser(scimAuth, userId, body = {}) {
  const email = decodeURIComponent(userId).toLowerCase();
  const operations = body.Operations || body.operations || [];
  let deactivate = false;
  for (const op of operations) {
    if (String(op.op).toLowerCase() === 'replace' && op.path === 'active' && op.value === false) {
      deactivate = true;
    }
    if (String(op.op).toLowerCase() === 'replace' && op.value?.active === false) {
      deactivate = true;
    }
  }

  const pool = getPool();
  if (deactivate) {
    await pool.query(
      `UPDATE org_members SET active = false, device_id = NULL, updated_at = now()
       WHERE org_id = $1 AND email = $2`,
      [scimAuth.org.id, email],
    );
    await deactivateOrgMemberDevices(pool, scimAuth.org.id, email);
  }

  const row = await pool.query(
    `SELECT email, display_name, active FROM org_members WHERE org_id = $1 AND email = $2`,
    [scimAuth.org.id, email],
  );
  if (row.rowCount === 0) throw httpError(404, 'User not found.');
  return scimUserResource(row.rows[0]);
}

export function isScimPath(pathname) {
  return pathname.startsWith(SCIM_PREFIX);
}

export async function handleScimRequest(req, pathname, url, body = {}) {
  const scimAuth = await authenticateScim(req);

  if (req.method === 'GET' && pathname === `${SCIM_PREFIX}/Users`) {
    return scimListUsers(scimAuth, {
      startIndex: url.searchParams.get('startIndex'),
      count: url.searchParams.get('count'),
    });
  }

  if (req.method === 'POST' && pathname === `${SCIM_PREFIX}/Users`) {
    return scimCreateUser(scimAuth, body);
  }

  const userMatch = pathname.match(/^\/scim\/v2\/Users\/([^/]+)$/);
  if (req.method === 'PATCH' && userMatch) {
    return scimPatchUser(scimAuth, userMatch[1], body);
  }

  throw httpError(404, 'SCIM resource not found.');
}

export async function bulkAddOrgMembers(admin, body = {}) {
  const members = Array.isArray(body.members) ? body.members : [];
  if (!members.length) throw httpError(400, 'members array is required.');
  if (members.length > 200) throw httpError(400, 'Maximum 200 members per bulk request.');

  const added = [];
  const errors = [];
  for (const entry of members) {
    try {
      const result = await addOrgMember(admin, entry);
      added.push(result.member);
    } catch (error) {
      errors.push({
        email: entry.email || entry,
        error: error.message || 'failed',
      });
    }
  }

  return { ok: true, added: added.length, errors: errors.length, members: added, failures: errors };
}
