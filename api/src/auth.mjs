import { getPool } from './db.mjs';
import { httpError } from './org-service.mjs';
import { assertProvisionedOrgCanOperate } from './billing-guard.mjs';

export async function authenticateRequest(token, deviceId) {
  const bearer = String(token || '').trim();
  const device = String(deviceId || '').trim();
  if (!bearer) throw httpError(401, 'Missing provision token.');
  if (!device) throw httpError(400, 'Missing device id.');

  const pool = getPool();
  const result = await pool.query(
    `SELECT dp.org_id, dp.device_id, dp.revoked_at,
            om.id AS member_id, om.email AS member_email,
            o.settings, o.created_at
     FROM device_provisions dp
     JOIN organizations o ON o.id = dp.org_id
     LEFT JOIN org_members om
       ON om.org_id = dp.org_id AND om.device_id = dp.device_id AND om.active = true
     WHERE dp.provision_token = $1 AND dp.device_id = $2`,
    [bearer, device],
  );

  if (result.rowCount === 0) throw httpError(401, 'Invalid provision token.');
  if (result.rows[0].revoked_at) throw httpError(401, 'Provision revoked.');
  assertProvisionedOrgCanOperate(result.rows[0]);
  return result.rows[0];
}

export function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

export function parseAuthHeaders(req) {
  const auth = String(req.headers.authorization || '');
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const deviceId = req.headers['x-device-id'] || '';
  return { token, deviceId };
}
