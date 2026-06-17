import { getPool } from './db.mjs';
import { httpError } from './org-service.mjs';
import { authenticateRequest, normalizeEmail } from './auth.mjs';

function validatePublicKeyJwk(jwk) {
  if (!jwk || typeof jwk !== 'object') throw httpError(400, 'publicKeyJwk is required.');
  if (jwk.kty !== 'EC' || jwk.crv !== 'P-256' || !jwk.x || !jwk.y) {
    throw httpError(400, 'publicKeyJwk must be a P-256 EC key.');
  }
}

export async function registerMember(token, deviceId, body = {}) {
  const auth = await authenticateRequest(token, deviceId);
  const email = normalizeEmail(body.email);
  if (!email || !email.includes('@')) throw httpError(400, 'Valid work email is required.');

  validatePublicKeyJwk(body.publicKeyJwk);

  const pool = getPool();
  const result = await pool.query(
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
      auth.org_id,
      email,
      String(body.displayName || '').trim() || null,
      JSON.stringify(body.publicKeyJwk),
      auth.device_id,
    ],
  );

  return { ok: true, member: result.rows[0] };
}

export async function listMembers(token, deviceId, query = '') {
  const auth = await authenticateRequest(token, deviceId);
  const pool = getPool();
  const term = normalizeEmail(query);

  const result = term
    ? await pool.query(
        `SELECT email, display_name, public_key_jwk, device_id IS NOT NULL AS registered
         FROM org_members
         WHERE org_id = $1
           AND active = true
           AND email <> COALESCE($3, '')
           AND (email ILIKE $2 OR display_name ILIKE $2)
         ORDER BY email
         LIMIT 50`,
        [auth.org_id, `%${term.replace(/[%_]/g, '')}%`, auth.member_email || ''],
      )
    : await pool.query(
        `SELECT email, display_name, public_key_jwk, device_id IS NOT NULL AS registered
         FROM org_members
         WHERE org_id = $1
           AND active = true
           AND email <> COALESCE($2, '')
         ORDER BY email
         LIMIT 100`,
        [auth.org_id, auth.member_email || ''],
      );

  return {
    members: result.rows.map((row) => ({
      email: row.email,
      displayName: row.display_name || '',
      registered: row.registered,
      publicKeyJwk: row.public_key_jwk,
    })),
    selfEmail: auth.member_email || '',
  };
}

export async function createShares(token, deviceId, body = {}) {
  const auth = await authenticateRequest(token, deviceId);
  const senderEmail = auth.member_email;
  if (!senderEmail) {
    throw httpError(400, 'Register your work email before sharing with colleagues.');
  }

  if (!body.markerFingerprint?.trim()) throw httpError(400, 'markerFingerprint is required.');

  const expiresAt = body.expiresAt
    ? new Date(body.expiresAt)
    : new Date(Date.now() + 72 * 60 * 60 * 1000);

  if (Number.isNaN(expiresAt.getTime())) throw httpError(400, 'Invalid expiresAt.');

  const deliveries = Array.isArray(body.deliveries) ? body.deliveries : [];
  if (deliveries.length === 0) {
    throw httpError(400, 'At least one delivery is required.');
  }

  const pool = getPool();
  const created = [];

  for (const delivery of deliveries) {
    const recipientEmail = normalizeEmail(delivery.recipientEmail);
    if (!recipientEmail || recipientEmail === senderEmail) continue;
    if (!delivery.wrappedKey || typeof delivery.wrappedKey !== 'object') {
      throw httpError(400, `wrappedKey is required for ${recipientEmail || 'recipient'}.`);
    }

    const memberResult = await pool.query(
      `SELECT email, public_key_jwk
       FROM org_members
       WHERE org_id = $1 AND email = $2 AND active = true`,
      [auth.org_id, recipientEmail],
    );

    if (memberResult.rowCount === 0) {
      throw httpError(404, `${recipientEmail} is not in your organization directory.`);
    }
    if (!memberResult.rows[0].public_key_jwk) {
      throw httpError(400, `${recipientEmail} has not registered for secure sharing yet.`);
    }

    const insert = await pool.query(
      `INSERT INTO pending_unlocks
         (org_id, sender_email, recipient_email, wrapped_key, marker_fingerprint, expires_at)
       VALUES ($1, $2, $3, $4::jsonb, $5, $6)
       RETURNING id, recipient_email, expires_at`,
      [
        auth.org_id,
        senderEmail,
        recipientEmail,
        JSON.stringify(delivery.wrappedKey),
        body.markerFingerprint.trim(),
        expiresAt.toISOString(),
      ],
    );

    created.push({
      id: insert.rows[0].id,
      recipientEmail: insert.rows[0].recipient_email,
      expiresAt: insert.rows[0].expires_at,
    });
  }

  if (created.length === 0) {
    throw httpError(400, 'No valid recipients to share with.');
  }

  return { ok: true, shares: created };
}

export async function listPendingShares(token, deviceId) {
  const auth = await authenticateRequest(token, deviceId);
  if (!auth.member_email) {
    return { shares: [], selfEmail: '' };
  }

  const pool = getPool();
  const result = await pool.query(
    `SELECT id, sender_email, wrapped_key, marker_fingerprint, expires_at, created_at
     FROM pending_unlocks
     WHERE org_id = $1
       AND recipient_email = $2
       AND claimed_at IS NULL
       AND expires_at > now()
     ORDER BY created_at DESC
     LIMIT 50`,
    [auth.org_id, auth.member_email],
  );

  return {
    selfEmail: auth.member_email,
    shares: result.rows.map((row) => ({
      id: row.id,
      senderEmail: row.sender_email,
      wrappedKey: row.wrapped_key,
      markerFingerprint: row.marker_fingerprint,
      expiresAt: row.expires_at,
      createdAt: row.created_at,
    })),
  };
}

export async function claimShare(token, deviceId, shareId) {
  const auth = await authenticateRequest(token, deviceId);
  if (!auth.member_email) throw httpError(400, 'Register your work email first.');

  const pool = getPool();
  const result = await pool.query(
    `UPDATE pending_unlocks
     SET claimed_at = now(), claimed_by_device_id = $4
     WHERE id = $1
       AND org_id = $2
       AND recipient_email = $3
       AND claimed_at IS NULL
     RETURNING id`,
    [shareId, auth.org_id, auth.member_email, auth.device_id],
  );

  if (result.rowCount === 0) throw httpError(404, 'Share not found or already claimed.');
  return { ok: true, id: result.rows[0].id };
}
