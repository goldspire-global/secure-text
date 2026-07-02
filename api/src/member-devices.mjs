import { getPool } from './db.mjs';

export async function linkOrgMemberDevice(pool, orgId, memberEmail, deviceId, publicKeyJwk = null) {
  const org = String(orgId || '').trim();
  const email = String(memberEmail || '').trim().toLowerCase();
  const device = String(deviceId || '').trim();
  if (!org || !email || !device) return null;

  const member = await pool.query(
    `SELECT id FROM org_members
     WHERE org_id = $1 AND email = $2 AND active = true
     LIMIT 1`,
    [org, email],
  );
  if (member.rowCount === 0) return null;

  const memberId = member.rows[0].id;
  const keyJson = publicKeyJwk ? JSON.stringify(publicKeyJwk) : null;

  await pool.query(
    `INSERT INTO org_member_devices (org_id, member_id, device_id, public_key_jwk, active)
     VALUES ($1, $2, $3, $4::jsonb, true)
     ON CONFLICT (org_id, device_id) DO UPDATE SET
       member_id = EXCLUDED.member_id,
       public_key_jwk = COALESCE(EXCLUDED.public_key_jwk, org_member_devices.public_key_jwk),
       active = true,
       updated_at = now()`,
    [org, memberId, device, keyJson],
  );

  await pool.query(
    `UPDATE org_members
     SET device_id = COALESCE(device_id, $1),
         public_key_jwk = COALESCE($2::jsonb, public_key_jwk),
         updated_at = now()
     WHERE id = $3`,
    [device, keyJson, memberId],
  );

  return memberId;
}

export async function registerOrgMemberDeviceKey(pool, orgId, deviceId, email, publicKeyJwk, displayName = null) {
  const member = await pool.query(
    `INSERT INTO org_members (org_id, email, display_name, public_key_jwk, device_id, active)
     VALUES ($1, $2, $3, $4::jsonb, $5, true)
     ON CONFLICT (org_id, email) DO UPDATE SET
       display_name = COALESCE(EXCLUDED.display_name, org_members.display_name),
       public_key_jwk = EXCLUDED.public_key_jwk,
       device_id = EXCLUDED.device_id,
       active = true,
       updated_at = now()
     RETURNING id, email, display_name`,
    [
      orgId,
      email,
      displayName,
      JSON.stringify(publicKeyJwk),
      deviceId,
    ],
  );

  await pool.query(
    `INSERT INTO org_member_devices (org_id, member_id, device_id, public_key_jwk, active)
     VALUES ($1, $2, $3, $4::jsonb, true)
     ON CONFLICT (org_id, device_id) DO UPDATE SET
       member_id = EXCLUDED.member_id,
       public_key_jwk = EXCLUDED.public_key_jwk,
       active = true,
       updated_at = now()`,
    [orgId, member.rows[0].id, deviceId, JSON.stringify(publicKeyJwk)],
  );

  return member.rows[0];
}

export function memberRegisteredSql(alias = 'm') {
  return `EXISTS (
    SELECT 1 FROM org_member_devices omd
    WHERE omd.member_id = ${alias}.id
      AND omd.active = true
      AND omd.public_key_jwk IS NOT NULL
  )`;
}

export async function deactivateOrgMemberDevices(pool, orgId, email) {
  await pool.query(
    `UPDATE org_member_devices omd
     SET active = false, updated_at = now()
     FROM org_members om
     WHERE om.id = omd.member_id
       AND om.org_id = $1
       AND om.email = $2`,
    [orgId, email],
  );
}

export async function revokeOrgMemberDevice(pool, orgId, deviceId) {
  await pool.query(
    `UPDATE org_member_devices
     SET active = false, updated_at = now()
     WHERE org_id = $1 AND device_id = $2`,
    [orgId, deviceId],
  );
}
